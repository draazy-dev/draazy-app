package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** WhatsApps the flat owner when a tenant lists a room in their flat, with a one-tap agree/decline link.
 * The link token is the only credential on the public routes; only its hash is stored. */
@Service
public class FlatmateOwnerNoticeService {

    private static final Logger log = LoggerFactory.getLogger(FlatmateOwnerNoticeService.class);

    static final Duration VALIDITY = Duration.ofDays(30);
    static final Duration CAP_WINDOW = Duration.ofHours(24);
    static final int MAX_PER_HOST = 5;
    static final int MAX_PER_OWNER = 3;
    static final Duration PLATFORM_WINDOW = Duration.ofHours(1);

    static final String INVALID_LINK = "This link is no longer valid.";
    static final String DECLINED_REASON = "Owner said no on WhatsApp";

    private static final String FALLBACK_NAME = "Your tenant";
    private static final String AUDIT_ACTOR = "owner-link";

    private final FlatmateOwnerNoticeRepository notices;
    private final FlatmateOwnerConsentService consents;
    private final FlatmateRoomRepository rooms;
    private final FlatmateReviewRepository reviews;
    private final UserRepository users;
    private final DecisionMessenger messenger;
    private final AuditService audit;
    private final FlatmateOwnerHomeProvisioner homes;
    private final Notifier notifier;
    private final RateLimitLock locks;
    private final String baseUrl;
    private final int maxPerHour;

    public FlatmateOwnerNoticeService(FlatmateOwnerNoticeRepository notices,
            FlatmateOwnerConsentService consents, FlatmateRoomRepository rooms,
            FlatmateReviewRepository reviews, UserRepository users, DecisionMessenger messenger,
            AuditService audit, FlatmateOwnerHomeProvisioner homes, Notifier notifier, RateLimitLock locks,
            @Value("${draazy.app.base-url}") String baseUrl,
            @Value("${draazy.flatmates.owner-notices-per-hour:30}") int maxPerHour) {
        this.notices = notices;
        this.consents = consents;
        this.rooms = rooms;
        this.reviews = reviews;
        this.users = users;
        this.messenger = messenger;
        this.audit = audit;
        this.homes = homes;
        this.notifier = notifier;
        this.locks = locks;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.maxPerHour = maxPerHour;
    }

    /** Old links answer 404 anyway; this only stops the table keeping an owner's number for ever. */
    @Transactional
    public long purgeExpired() {
        return notices.deleteExpired(Instant.now());
    }

    /** Never fails the post: a capped or unsendable notice only means the owner is not messaged. */
    @Transactional
    public void noticeIfNeeded(FlatmateRoom room) {
        if (!needsNotice(room)) {
            return;
        }
        locks.holdUntilCommit(RateLimitLock.Limit.OWNER_NOTICE, "all");
        if (notices.existsByRoomIdAndOwnerMobileAndAddressFingerprint(
                room.getId(), room.getOwnerConsentMobile(), room.getAddressFingerprint())) {
            return;
        }
        Instant since = Instant.now().minus(CAP_WINDOW);
        if (notices.countByHostIdAndCreatedAtAfter(room.getHostId(), since) >= MAX_PER_HOST
                || notices.countByOwnerMobileAndCreatedAtAfter(room.getOwnerConsentMobile(), since)
                        >= MAX_PER_OWNER) {
            log.info("Owner notice for {} skipped: send cap reached", MobileMask.mask(room.getOwnerConsentMobile()));
            return;
        }
        // Throwaway accounts each get MAX_PER_HOST, so only a platform budget bounds the paid sends.
        if (notices.countByCreatedAtAfter(Instant.now().minus(PLATFORM_WINDOW)) >= maxPerHour) {
            log.warn("Owner notice for {} skipped: the platform's {} an hour are spent",
                    MobileMask.mask(room.getOwnerConsentMobile()), maxPerHour);
            return;
        }
        if (ownerTurnedWhatsAppOff(room.getOwnerConsentMobile())) {
            log.info("Owner notice for {} skipped: WhatsApp is off in their settings",
                    MobileMask.mask(room.getOwnerConsentMobile()));
            return;
        }
        String token = Tokens.randomToken();
        notices.saveAndFlush(new FlatmateOwnerNotice(room.getId(), room.getHostId(),
                room.getOwnerConsentMobile(), room.getAddressFingerprint(), Tokens.sha256Hex(token),
                Instant.now().plus(VALIDITY)));
        String mobile = room.getOwnerConsentMobile();
        String tenant = firstName(room.getHostId());
        String place = placeOf(room);
        String link = baseUrl + "/owner-confirm#" + token;
        afterCommit(() -> dispatch(mobile, tenant, place, link));
    }

    private boolean ownerTurnedWhatsAppOff(String mobile) {
        return users.findByMobile(mobile).filter(owner -> !notifier.allowsWhatsapp(owner.getId())).isPresent();
    }

    private static boolean needsNotice(FlatmateRoom room) {
        return FlatmateVocabulary.ROLE_TENANT.equals(room.getHostRole())
                && !FlatmateVocabulary.TIER_OWNER.equals(room.getVerificationTier())
                && room.getOwnerConsentMobile() != null
                && room.getAddressFingerprint() != null
                && !room.isOwnerConsent();
    }

    // A rolled-back post must message nobody.
    private static void afterCommit(Runnable send) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send.run();
            }
        });
    }

    private void dispatch(String mobile, String tenant, String place, String link) {
        try {
            messenger.sendOwnerNotice(mobile, tenant, place, link);
        } catch (RuntimeException e) {
            log.warn("Owner notice to {} failed", MobileMask.mask(mobile), e);
        }
    }

    @Transactional(readOnly = true)
    public FlatmateOwnerNoticeView view(String token) {
        Standing standing = standing(notices.findByTokenHash(hashOf(token)));
        return viewOf(standing);
    }

    @Transactional
    public FlatmateOwnerNoticeView answer(String token, String answer) {
        String outcome = switch (answer == null ? "" : answer.strip().toLowerCase()) {
            case "agree" -> FlatmateOwnerNotice.AGREED;
            case "decline" -> FlatmateOwnerNotice.DECLINED;
            default -> throw new ValidationException("answer must be \"agree\" or \"decline\".");
        };
        Standing standing = standing(notices.findLockedByTokenHash(hashOf(token)));
        FlatmateOwnerNotice notice = standing.notice();
        if (notice.answered()) {
            if (!outcome.equals(notice.getStatus())) {
                throw new ConflictException("You've already answered.");
            }
            return viewOf(standing);
        }
        notice.answer(outcome, Instant.now());
        notices.saveAndFlush(notice);
        if (FlatmateOwnerNotice.AGREED.equals(outcome)) {
            consents.grantFromNotice(notice.getHostId(), notice.getOwnerMobile(), notice.getAddressFingerprint());
        } else {
            holdForReview(standing.room());
        }
        audit.record(AUDIT_ACTOR, "owner", "flatmate.ownerNotice." + outcome, "flatmateRoom",
                notice.getRoomId().toString(), Map.of("hostId", notice.getHostId().toString(),
                        "ownerMobile", MobileMask.mask(notice.getOwnerMobile()),
                        "noticeId", notice.getId().toString()));
        if (FlatmateOwnerNotice.AGREED.equals(outcome)) {
            homes.saveHome(notice, standing.room());
        }
        tellHost(notice, standing.room());
        return viewOf(standing);
    }

    private void tellHost(FlatmateOwnerNotice notice, FlatmateRoom room) {
        String place = placeOf(room);
        String link = FlatmateLinks.of("room", room.getId());
        if (FlatmateOwnerNotice.AGREED.equals(notice.getStatus())) {
            notifier.notify(notice.getHostId(), "flatmate.ownerNotice.agreed", "The owner confirmed your room",
                    "The owner of " + place + " said yes on WhatsApp. Your post can now earn the Verified property badge.", link);
        } else {
            notifier.notify(notice.getHostId(), "flatmate.ownerNotice.declined", "The owner said no to your room",
                    place + " is back in review. Ops will contact you.", link);
        }
    }

    private void holdForReview(FlatmateRoom room) {
        room.setFlagForReview(true);
        room.setModStatus(FlatmateVocabulary.MOD_PENDING);
        room.getRecheck().clear();
        rooms.saveAndFlush(room);
        FlatmateReview review = reviews.findByRoomId(room.getId()).orElseGet(() -> new FlatmateReview(
                "room", room.getId(), null, room.getHostId(), placeOf(room), room.getVerificationTier(),
                true, false, null, null, null));
        review.holdForReview(DECLINED_REASON);
        reviews.saveAndFlush(review);
    }

    /** An edit that moved the flat or the owner's number voids the old link rather than letting it
     * vouch for a different address. */
    private Standing standing(Optional<FlatmateOwnerNotice> found) {
        FlatmateOwnerNotice notice = found
                .filter(n -> n.getExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new NotFoundException(INVALID_LINK));
        FlatmateRoom room = rooms.findById(notice.getRoomId())
                .filter(r -> !r.isArchived())
                .filter(r -> notice.getOwnerMobile().equals(r.getOwnerConsentMobile())
                        && notice.getAddressFingerprint().equals(r.getAddressFingerprint()))
                .orElseThrow(() -> new NotFoundException(INVALID_LINK));
        return new Standing(notice, room);
    }

    private FlatmateOwnerNoticeView viewOf(Standing standing) {
        FlatmateRoom room = standing.room();
        FlatmateOwnerNotice notice = standing.notice();
        boolean homeSaved = FlatmateOwnerNotice.AGREED.equals(notice.getStatus()) && homes.isSaved(notice);
        return new FlatmateOwnerNoticeView(firstName(room.getHostId()), room.getSociety(),
                room.getLocality(), room.getRoomType(), room.getBudget(), notice.getStatus(), homeSaved);
    }

    private static String hashOf(String token) {
        if (token == null || token.isBlank()) {
            throw new NotFoundException(INVALID_LINK);
        }
        return Tokens.sha256Hex(token.strip());
    }

    private String firstName(java.util.UUID hostId) {
        String name = users.findById(hostId).map(User::getName).orElse(null);
        if (name == null || name.isBlank()) {
            return FALLBACK_NAME;
        }
        String first = name.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }

    private static String placeOf(FlatmateRoom room) {
        String society = FlatmateVocabulary.blankToNull(room.getSociety());
        return society == null ? room.getLocality() : society + ", " + room.getLocality();
    }

    private record Standing(FlatmateOwnerNotice notice, FlatmateRoom room) {
    }
}