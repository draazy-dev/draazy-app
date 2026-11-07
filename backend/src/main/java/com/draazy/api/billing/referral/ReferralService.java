package com.draazy.api.billing.referral;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.AgreementCreditUsageLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReferralService {
    private static final Logger log = LoggerFactory.getLogger(ReferralService.class);

    private final ReferralRepository referrals;
    private final ReferralCodeRepository codes;
    private final ReferralMapper mapper;
    private final UserRepository users;
    private final PlatformSettings settings;
    private final ReferralSignals signals;
    private final AuditService audit;
    private final AgreementCreditUsageLookup agreementCredits;
    private final ReferralOutcomes outcomes;
    private final ReferralCodeMinter minter;
    private final ReferralRedemption redemption;
    private final ReferralRedeemFailures redeemFailures;
    private final ReferralInviteRepository invites;

    public ReferralService(ReferralRepository referrals, ReferralCodeRepository codes,
            ReferralMapper mapper, UserRepository users, PlatformSettings settings,
            ReferralSignals signals, AuditService audit, AgreementCreditUsageLookup agreementCredits,
            ReferralOutcomes outcomes, ReferralCodeMinter minter, ReferralRedemption redemption,
            ReferralRedeemFailures redeemFailures, ReferralInviteRepository invites) {
        this.referrals = referrals;
        this.codes = codes;
        this.mapper = mapper;
        this.users = users;
        this.settings = settings;
        this.signals = signals;
        this.audit = audit;
        this.agreementCredits = agreementCredits;
        this.outcomes = outcomes;
        this.minter = minter;
        this.redemption = redemption;
        this.redeemFailures = redeemFailures;
        this.invites = invites;
    }

    @Transactional
    public ReferralSummaryDto summary(AuthPrincipal caller, HttpServletRequest request) {
        String code = minter.codeFor(caller.userId(), request);
        List<Referral> mine = referrals.findByReferrerId(caller.userId());
        int checking = (int) mine.stream().filter(r -> ReferralStatuses.HELD.equals(r.getStatus())).count();
        int qualified = (int) mine.stream().filter(r -> ReferralStatuses.isGranting(r.getStatus())).count();
        int used = Math.toIntExact(agreementCredits.agreementCreditsHeld(caller.userId()));
        var rewards = new ReferralSummaryDto.Rewards(qualified, used, Math.max(0, qualified - used),
                Math.toIntExact(settings.referralAgreementDiscountPercent()));
        return new ReferralSummaryDto(code, Math.toIntExact(invites.countByReferrerId(caller.userId())),
                mine.size(), qualified, checking, rewards, friendReward(caller.userId()));
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

    @Transactional
    public void redeem(AuthPrincipal caller, String rawCode, String shareChannel,
            HttpServletRequest request) {
        User referred = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        ReferralSignals.Signals observed = signals.of(request);
        if (redeemFailures.lockedOut(referred.getId())) {
            throw ReferralRedemption.refuse();
        }
        String code = normalise(rawCode);
        // Read before attribute(): a lost insert race aborts the transaction, so no query can run after it.
        boolean alreadyReferred = referrals.existsByReferredMobile(referred.getMobile());
        try {
            ReferralCode owner = (code == null ? Optional.<ReferralCode>empty() : codes.findByCode(code))
                    .orElseThrow(ReferralRedemption::refuse);
            redemption.attribute(referred, owner, shareChannel, observed);
        } catch (ConflictException refused) {
            if (settings.referralRewardsEnabled() && !alreadyReferred) {
                countFailure(referred.getId(), observed.ipHash());
            }
            throw refused;
        }
    }

    private void countFailure(UUID userId, String ipHash) {
        try {
            redeemFailures.record(userId, ipHash);
        } catch (DataAccessException e) {
            log.warn("Could not count a refused referral redeem for {}", userId, e);
        }
    }

    @Transactional(readOnly = true)
    public Page<ReferralDto> queue(String status, String risk, String q, Integer days, Pageable pageable) {
        List<String> statuses = blankToNull(status) == null ? List.of()
                : Arrays.stream(status.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        Page<Referral> page = referrals.queue(statuses.isEmpty(), statuses.isEmpty() ? List.of("") : statuses,
                blankToNull(risk), LikePatterns.contains(q), since(days), pageable);
        return new PageImpl<>(mapper.toDtos(page.getContent()), pageable, page.getTotalElements());
    }

    private static Instant since(Integer days) {
        Instant since = PlatformTime.sinceOrNull(days);
        return since == null ? Instant.EPOCH : since;
    }

    @Transactional(readOnly = true)
    public Map<String, Long> queueCounts() {
        Object[] row = referrals.tabCounts().getFirst();
        return Map.of("all", (Long) row[0], "pending", (Long) row[1], "held", (Long) row[2],
                "highRisk", (Long) row[3], "rewarded", (Long) row[4], "refused", (Long) row[5]);
    }

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

    @Transactional
    public ReferralDto clawback(AuthPrincipal actor, String id, String reason) {
        return decide(actor, id, ReferralStatuses.CLAWED_BACK, reason,
                r -> ReferralStatuses.canClawBack(r.getStatus()) ? null : illegalMove(r, ReferralStatuses.CLAWED_BACK),
                "referral.clawback");
    }

    private static String illegalMove(Referral referral, String nextStatus) {
        return "Referral is " + referral.getStatus() + " and cannot be " + nextStatus;
    }

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
        outcomes.decidedByStaff(referral);
        audit.record(actor, action, "referral", referral.getId().toString(),
                "contacts", String.valueOf(referral.getRewardAmount()), "reason", blankToNull(reason));
        return mapper.toDto(referral);
    }

    private static String normalise(String code) {
        if (code == null) {
            return null;
        }
        String trimmed = code.trim().toUpperCase(java.util.Locale.ROOT);
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
