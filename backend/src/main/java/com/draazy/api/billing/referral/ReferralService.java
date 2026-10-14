package com.draazy.api.billing.referral;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.ContactUsageLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Referral scheme: caller's code and rewards, redemption, and the ops desk's overrides.
 * Rationale: docs/flows/consumer/plans-billing-refer.md, docs/flows/ops/referrals-fraud.md. */
@Service
public class ReferralService {

    private static final String CODE_PREFIX = "PUNE-";

    // Excludes I, O, 0, 1: codes are dictated aloud and typo-prone.
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private static final int CODE_LENGTH = 4;

    private static final int CODE_ATTEMPTS = 5;

    private static final Duration VELOCITY_WINDOW = Duration.ofDays(1);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ReferralRepository referrals;
    private final ReferralCodeRepository codes;
    private final ReferralMapper mapper;
    private final UserRepository users;
    private final PlatformSettings settings;
    private final ReferralSignals signals;
    private final AuditService audit;
    private final ContactUsageLookup contactUsage;
    private final ReferralOutcomes outcomes;

    public ReferralService(ReferralRepository referrals, ReferralCodeRepository codes,
            ReferralMapper mapper, UserRepository users, PlatformSettings settings,
            ReferralSignals signals, AuditService audit, ContactUsageLookup contactUsage,
            ReferralOutcomes outcomes) {
        this.referrals = referrals;
        this.codes = codes;
        this.mapper = mapper;
        this.users = users;
        this.settings = settings;
        this.signals = signals;
        this.audit = audit;
        this.contactUsage = contactUsage;
        this.outcomes = outcomes;
    }

    /** {@code GET /me/referrals}: mints on first read and refreshes the referrer's own signals every time. */
    @Transactional
    public ReferralSummaryDto summary(AuthPrincipal caller, HttpServletRequest request) {
        String code = codeFor(caller.userId(), request);
        List<Referral> mine = referrals.findByReferrerId(caller.userId());
        int held = (int) mine.stream().filter(r -> ReferralStatuses.HELD.equals(r.getStatus())).count();
        int converted = (int) mine.stream().filter(r -> ReferralStatuses.isGranting(r.getStatus())).count();

        Object[] granted = referrals.grantedByTrack(caller.userId()).getFirst();
        int ownerReferrals = ((Number) granted[0]).intValue();
        int seekerReferrals = ((Number) granted[1]).intValue();
        var earned = new ReferralSummaryDto.Earned(
                new ReferralSummaryDto.OwnerTrack(ownerReferrals,
                        Math.toIntExact(ownerReferrals * settings.referralOwnerRewardAgreements())),
                new ReferralSummaryDto.SeekerTrack(seekerReferrals,
                        Math.toIntExact(seekerReferrals * settings.referralContactBonus())));
        return new ReferralSummaryDto(code, mine.size(), converted, held, earned, friendReward(caller.userId()));
    }

    private ReferralSummaryDto.FriendReward friendReward(UUID userId) {
        Optional<Referral> mine = referrals.findByReferee(userId);
        if (mine.isEmpty()) {
            return new ReferralSummaryDto.FriendReward(false, null, null, 0, 0);
        }
        Referral r = mine.get();
        boolean stands = ReferralStatuses.keepsFriendReward(r.getStatus());
        boolean contacts = stands && !ReferralStatuses.TRACK_OWNER.equals(r.getTrack());
        boolean featured = stands && !ReferralStatuses.TRACK_SEEKER.equals(r.getTrack());
        return new ReferralSummaryDto.FriendReward(true, r.getStatus(), r.getTrack(),
                contacts ? Math.toIntExact(settings.referralSeekerBonusContacts()) : 0,
                featured ? Math.toIntExact(settings.referralOwnerFeaturedDays()) : 0);
    }

    /** {@code POST /referrals/redeem}: 200, or a single indistinguishable 409 for every refusal. */
    @Transactional
    public void redeem(AuthPrincipal caller, String rawCode, String shareChannel,
            HttpServletRequest request) {
        User referred = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));

        String code = normalise(rawCode);
        Optional<ReferralCode> owner = code == null ? Optional.empty() : codes.findByCode(code);
        if (!settings.referralRewardsEnabled()
                || owner.isEmpty()
                || owner.get().getUserId().equals(caller.userId())
                || referrals.existsByReferredMobile(referred.getMobile())
                || !withinSignupWindow(referred)
                || referred.getListingsCount() > 0
                || !contactUsage.contactTimes(caller.userId()).isEmpty()) {
            throw refuse();
        }

        User referrer = users.findById(owner.get().getUserId()).orElseThrow(this::refuse);
        ReferralSignals.Signals observed = signals.of(request);
        if (ReferralSignals.matches(owner.get().getReferrerDeviceIdHash(), observed.deviceIdHash())) {
            throw refuse();
        }

        boolean velocityHigh = referrals.countByReferrerIdAndAtAfter(
                referrer.getId(), Instant.now().minus(VELOCITY_WINDOW)) >= settings.referralVelocityPerDay();
        boolean sameIp = ReferralSignals.matches(owner.get().getReferrerIpHash(), observed.ipHash());
        boolean sameUa = ReferralSignals.matches(owner.get().getReferrerDeviceHash(), observed.deviceHash());
        boolean noDeviceId = observed.deviceIdHash() == null;
        boolean newReferrer = referrer.getCreatedAt() != null && referrer.getCreatedAt()
                .isAfter(Instant.now().minus(Duration.ofDays(settings.referralNewReferrerDays())));

        Referral referral = new Referral(
                referrer.getId(),
                referrer.getMobile(),
                referred.getName(),
                referred.getMobile(),
                "seeker",
                ShareChannels.normalise(shareChannel),
                risk(velocityHigh, sameIp, sameUa, newReferrer, noDeviceId),
                referred.isVerified(),
                velocityHigh,
                sameUa,
                sameIp,
                observed);
        try {
            referrals.saveAndFlush(referral);
        } catch (DataIntegrityViolationException raced) {
            throw refuse();
        }
    }

    private boolean withinSignupWindow(User referred) {
        return referred.getCreatedAt() != null && referred.getCreatedAt()
                .plus(Duration.ofHours(settings.referralSignupWindowHours())).isAfter(Instant.now());
    }

    // Velocity alone is high; otherwise two of the other signals together are, one is medium. An omitted
    // device id is a signal, so leaving the header out is never easier than sending it.
    private static String risk(boolean velocityHigh, boolean sameIp, boolean sameUa, boolean newReferrer,
            boolean noDeviceId) {
        int correlated = (sameIp ? 1 : 0) + (sameUa ? 1 : 0) + (newReferrer ? 1 : 0) + (noDeviceId ? 1 : 0);
        if (velocityHigh || correlated >= 2) {
            return ReferralStatuses.RISK_HIGH;
        }
        return correlated == 1 ? ReferralStatuses.RISK_MEDIUM : ReferralStatuses.RISK_LOW;
    }

    /** The paged queue ({@code x-roles: [staff, admin]}); {@code status} is a comma-separated set. */
    @Transactional(readOnly = true)
    public Page<ReferralDto> queue(String status, String risk, String q, Pageable pageable) {
        List<String> statuses = blankToNull(status) == null ? List.of()
                : Arrays.stream(status.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        Page<Referral> page = referrals.queue(statuses.isEmpty(), statuses.isEmpty() ? List.of("") : statuses,
                blankToNull(risk), LikePatterns.contains(q), pageable);
        return new PageImpl<>(mapper.toDtos(page.getContent()), pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public Map<String, Long> queueCounts() {
        Object[] row = referrals.tabCounts().getFirst();
        return Map.of("all", (Long) row[0], "pending", (Long) row[1], "held", (Long) row[2],
                "highRisk", (Long) row[3], "rewarded", (Long) row[4], "refused", (Long) row[5]);
    }

    /** Override: earns the reward whatever the automatic decision was. A rejected row is an appeal: reason required. */
    @Transactional
    public ReferralDto approve(AuthPrincipal actor, String id, String reason) {
        return decide(actor, id, ReferralStatuses.REWARDED, reason, r -> {
            if (!ReferralStatuses.canApprove(r.getStatus())) {
                return illegalMove(r, ReferralStatuses.REWARDED);
            }
            if (ReferralStatuses.REJECTED.equals(r.getStatus()) && blankToNull(reason) == null) {
                throw new ValidationException("A reason is required to approve a rejected referral");
            }
            return null;
        }, "referral.approve");
    }

    @Transactional
    public ReferralDto reject(AuthPrincipal actor, String id, String reason) {
        return decide(actor, id, ReferralStatuses.REJECTED, reason,
                r -> ReferralStatuses.canReject(r.getStatus()) ? null : illegalMove(r, ReferralStatuses.REJECTED),
                "referral.reject");
    }

    /** Reverses a reward that was granted, so history never says something was paid when it was not. */
    @Transactional
    public ReferralDto clawback(AuthPrincipal actor, String id, String reason) {
        return decide(actor, id, ReferralStatuses.CLAWED_BACK, reason,
                r -> ReferralStatuses.canClawBack(r.getStatus()) ? null : illegalMove(r, ReferralStatuses.CLAWED_BACK),
                "referral.clawback");
    }

    private static String illegalMove(Referral referral, String nextStatus) {
        return "Referral is " + referral.getStatus() + " and cannot be " + nextStatus;
    }

    // Write-locked check-then-act; `refusal` returns the exact sentence to send back, or null.
    private ReferralDto decide(AuthPrincipal actor, String id, String nextStatus, String reason,
            Function<Referral, String> refusal, String action) {
        Referral referral = Ids.parseUuid(id)
                .flatMap(referrals::findForDecision)
                .orElseThrow(() -> NotFoundException.of("Referral"));
        String refused = refusal.apply(referral);
        if (refused != null) {
            throw new ConflictException(refused);
        }
        referral.decide(nextStatus, actor.userId().toString(), blankToNull(reason));
        referrals.saveAndFlush(referral);
        outcomes.syncFeatured(referral);
        audit.record(actor, action, "referral", referral.getId().toString(),
                "contacts", String.valueOf(referral.getRewardAmount()), "reason", blankToNull(reason));
        return mapper.toDto(referral);
    }

    // Looks before leaping: a constraint violation would poison the persistence context.
    private String codeFor(UUID userId, HttpServletRequest request) {
        ReferralSignals.Signals observed = signals.of(request);
        Optional<ReferralCode> existing = codes.findById(userId);
        if (existing.isPresent()) {
            existing.get().refresh(observed);
            return existing.get().getCode();
        }
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            String candidate = generateCode();
            if (!codes.existsByCode(candidate)) {
                return codes.saveAndFlush(new ReferralCode(userId, candidate, observed)).getCode();
            }
        }
        throw new IllegalStateException("Could not mint a unique referral code for " + userId);
    }

    private static String generateCode() {
        StringBuilder code = new StringBuilder(CODE_PREFIX);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    // Codes are dictated aloud and pasted with stray spaces; store and match one canonical form.
    private static String normalise(String code) {
        if (code == null) {
            return null;
        }
        String trimmed = code.trim().toUpperCase(java.util.Locale.ROOT);
        return trimmed.isEmpty() ? null : trimmed;
    }

    private ConflictException refuse() {
        return new ConflictException("That referral code cannot be redeemed");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
