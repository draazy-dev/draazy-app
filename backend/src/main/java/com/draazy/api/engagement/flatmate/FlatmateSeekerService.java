package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.error.VerificationRequiredException;
import com.draazy.api.common.persistence.ConstraintViolations;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateSeekerService {
    private static final Logger log = LoggerFactory.getLogger(FlatmateSeekerService.class);

    private static final int MAX_INTERESTS = 10;

    private static final Duration RATE_WINDOW = Duration.ofHours(1);

    private static final int MAX_MESSAGE = 4000;

    private static final String ONE_PER_TARGET_INDEX = "uq_flatmate_requests_target_requester";

    private static final java.util.Set<String> INTEREST_KINDS =
            java.util.Set.of("flatmate", "room", "group");

    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRequestRepository requests;

    private final FlatmateRequestHydrator hydrator;
    private final FlatmateMapper mapper;
    private final UserRepository users;
    private final Notifier notifier;

    private final RateLimitLock locks;
    private final FlatmateEditRules editRules;
    private final FlatmateAcceptance acceptance;
    private final LocalityBinding localities;
    private final FlatmateGenderGate genderGate;
    private final FlatmateInterestLedger ledger;

    public FlatmateSeekerService(FlatmateSeekerPostRepository posts,
            FlatmateRequestRepository requests, FlatmateRequestHydrator hydrator,
            FlatmateMapper mapper, UserRepository users,
            Notifier notifier, RateLimitLock locks,
            FlatmateEditRules editRules, FlatmateAcceptance acceptance, LocalityBinding localities,
            FlatmateGenderGate genderGate, FlatmateInterestLedger ledger) {
        this.posts = posts;
        this.requests = requests;
        this.hydrator = hydrator;
        this.mapper = mapper;
        this.users = users;
        this.notifier = notifier;
        this.locks = locks;
        this.editRules = editRules;
        this.acceptance = acceptance;
        this.localities = localities;
        this.genderGate = genderGate;
        this.ledger = ledger;
    }

    @Transactional
    public FlatmateSeekerPostDto create(AuthPrincipal caller, FlatmateSeekerPostCreateRequest body) {
        if (posts.existsByUserIdAndArchivedFalse(caller.userId())) {
            throw new ConflictException(
                    "You already have a live flatmate post. Edit it, or take it down before "
                            + "posting another. (already_live)");
        }
        User author = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));

        FlatmateSeekerPost post = new FlatmateSeekerPost(
                caller.userId(), FlatmateVocabulary.profileName(author), body.budget());
        apply(post, body, author);

        // Snapshotted from the token, never the body: a client-assertable badge would be worthless.
        post.setVerified(caller.verified());
        post.setModStatus(FlatmateVocabulary.MOD_LIVE);
        FlatmatePublication.queueUnreviewed(post.getRecheck(), FlatmateVocabulary.MOD_LIVE, true);
        return mapper.toDto(posts.saveAndFlush(post),
                new FlatmateMapper.SeekerView(author.getMobile()));
    }

    @Transactional
    public FlatmateSeekerPostDto update(AuthPrincipal caller, UUID postId,
            FlatmateSeekerPostCreateRequest body) {
        FlatmateSeekerPost post = posts.findLockedById(postId)
                .filter(p -> !p.isArchived() && p.getUserId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        User author = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        String name = FlatmateVocabulary.profileName(author);
        FlatmateEditImpact impact = editRules.classify(post, body, name);
        post.setName(name);
        post.setBudget(body.budget());
        apply(post, body, author);
        post.setModStatus(post.getExpiry().revive(post.getModStatus()));
        post.getRecheck().settle(post.getModStatus(), impact.rechecked());
        return mapper.toDto(posts.saveAndFlush(post),
                new FlatmateMapper.SeekerView(author.getMobile()));
    }

    @Transactional
    public void delete(AuthPrincipal caller, UUID postId) {
        FlatmateSeekerPost post = posts.findById(postId)
                .filter(p -> !p.isArchived() && p.getUserId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        post.archive("removed by the poster");
        posts.saveAndFlush(post);
    }

    @Transactional
    public void express(AuthPrincipal caller, UUID postId, String share, String message) {
        FlatmateSeekerPost post = posts.findVisible(postId)
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));

        UUID hostId = post.getUserId();
        if (hostId.equals(caller.userId())) {
            throw new ForbiddenException("You cannot express interest in your own post.");
        }
        genderGate.refuseKnownMismatch(caller.userId(), post.getFlatPref(), "post");

        if (post.isVerifiedContactOnly() && !caller.verified()) {
            throw new VerificationRequiredException(
                    "This person accepts messages from verified members only. "
                            + "Verify your identity to get in touch. (verification_required)");
        }

        String intent = FlatmateVocabulary.orDefault(
                share, FlatmateVocabulary.SHARE_INTENT, "solo", "share intent");
        String body = pitch(message, intent);

        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_INTEREST, caller.userId().toString());

        if (requests.findByKindAndTargetIdAndRequesterId(
                "flatmate", post.getId(), caller.userId()).isPresent()) {
            throw alreadyInterested();
        }
        ledger.requireNotRecentlyWithdrawn("flatmate", post.getId(), caller.userId());

        if (ledger.sentSince(caller.userId(), Instant.now().minus(RATE_WINDOW)) >= MAX_INTERESTS) {
            throw new RateLimitedException(
                    "You have contacted a lot of people in the last hour. Try again shortly.",
                    (int) RATE_WINDOW.toSeconds());
        }

        try {
            requests.saveAndFlush(new FlatmateRequest(
                    "flatmate", post.getId(), hostId, caller.userId(), intent, body));
        } catch (DataIntegrityViolationException raced) {
            if (!isDuplicateInterest(raced)) {
                throw raced;
            }

            log.debug("duplicate flatmate interest reached the index: post={} requester={}",
                    post.getId(), caller.userId());
            throw alreadyInterested();
        }

        User requester = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        notify(hostId, post, requester);
    }

    @Transactional(readOnly = true)
    public Page<FlatmateSeekerPostDto> myPosts(AuthPrincipal caller, Pageable pageable) {
        User author = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        List<FlatmateSeekerPostDto> mine = posts.findByUserIdAndArchivedFalse(caller.userId())
                .map(post -> mapper.toDto(post, new FlatmateMapper.SeekerView(author.getMobile())))
                .map(List::of)
                .orElseGet(List::of);
        return new PageImpl<>(mine, pageable, mine.size());
    }

    @Transactional(readOnly = true)
    public FlatmateSeekerPostDto myPost(AuthPrincipal caller, UUID postId) {
        FlatmateSeekerPost post = posts.findById(postId)
                .filter(p -> !p.isArchived() && p.getUserId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        User author = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        return mapper.toDto(post, new FlatmateMapper.SeekerView(author.getMobile()));
    }

    @Transactional(readOnly = true)
    public Page<FlatmateRequestDto> inbox(AuthPrincipal caller, String status, Pageable pageable) {
        String filter = FlatmateVocabulary.optional(
                status, FlatmateVocabulary.REQUEST_STATUS, "status");
        Page<FlatmateRequest> rows = filter == null
                ? requests.findByHostIdOrderByRequestedAtDesc(caller.userId(), pageable)
                : requests.findByHostIdAndStatusOrderByRequestedAtDesc(
                        caller.userId(), filter, pageable);
        List<FlatmateRequestDto> window = hydrator.hydrate(rows.getContent()).stream()
                .map(FlatmateRequestDto::forHost).toList();
        return new PageImpl<>(window, pageable, rows.getTotalElements());
    }

    @Transactional
    public FlatmateRequestDto decide(AuthPrincipal caller, UUID requestId, String decision) {
        String verdict = FlatmateVocabulary.require(
                decision == null ? "" : decision.strip(),
                java.util.Set.of("accepted", "declined"), "decision");

        FlatmateRequest request = requests.findByIdAndHostId(requestId, caller.userId())
                .orElseThrow(() -> NotFoundException.of("Flatmate request"));
        String before = request.getStatus();
        if (verdict.equals(before)) {
            return hydrator.hydrateOne(request).forHost();
        }
        if (!request.isPending()) {
            throw new ConflictException(FlatmateConflicts.mark(
                    "You have already answered this request.", FlatmateConflicts.ALREADY_DECIDED));
        }
        if ("accepted".equals(verdict)) {
            acceptance.apply(request);
        }
        request.decide(verdict);
        requests.saveAndFlush(request);

        notifyDecision(request, verdict);
        return hydrator.hydrateOne(request).forHost();
    }

    @Transactional(readOnly = true)
    public Page<FlatmateRequestDto> outbox(AuthPrincipal caller, String status, Pageable pageable) {
        String filter = FlatmateVocabulary.optional(
                status, FlatmateVocabulary.REQUEST_STATUS, "status");
        Page<FlatmateRequest> rows = filter == null
                ? requests.findByRequesterIdOrderByCreatedAtDesc(caller.userId(), pageable)
                : requests.findByRequesterIdAndStatusOrderByCreatedAtDesc(
                        caller.userId(), filter, pageable);
        return new PageImpl<>(hydrator.hydrate(rows.getContent()), pageable, rows.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<FlatmateInterestKeyDto> outboxKeys(AuthPrincipal caller) {
        return requests.findKeysByRequesterId(caller.userId());
    }

    @Transactional
    public void withdraw(AuthPrincipal caller, String kind, UUID targetId) {
        String door = FlatmateVocabulary.require(
                kind == null ? "" : kind.strip(), INTEREST_KINDS, "kind");
        FlatmateRequest request = requests
                .findByKindAndTargetIdAndRequesterId(door, targetId, caller.userId())
                .orElseThrow(() -> NotFoundException.of("Flatmate interest"));
        if (!request.isPending() || requests.deleteIfPending(request.getId()) == 0) {
            throw new ConflictException(FlatmateConflicts.mark(
                    "The host has already answered this one, so it cannot be withdrawn.",
                    FlatmateConflicts.ALREADY_DECIDED));
        }
        ledger.recordWithdrawal(request);
    }

    private void apply(FlatmateSeekerPost post, FlatmateSeekerPostCreateRequest body, User author) {
        post.setGender(genderGate.forPost(author, body.gender()));
        post.setFlatPref(FlatmateVocabulary.orDefault(
                body.flatPref(), FlatmateVocabulary.FLAT_PREF, "any", "flat preference"));
        post.setRoomPref(FlatmateVocabulary.orDefault(
                body.roomPref(), FlatmateVocabulary.ROOM_PREF, "any", "room preference"));
        post.setFurnishing(FlatmateVocabulary.optional(body.furnishing(), FlatmateVocabulary.FURNISHING, "furnishing"));
        post.setGatedOnly(Boolean.TRUE.equals(body.gatedOnly()));
        post.setAttachedBath(Boolean.TRUE.equals(body.attachedBath()));
        post.setParking(FlatmateVocabulary.optional(body.parking(), FlatmateVocabulary.PARKING, "parking"));
        post.setAge(body.age());
        post.setBudgetMax(budgetCeiling(body));
        post.setOccupation(FlatmateVocabulary.blankToNull(body.occupation()));
        post.setNote(FlatmateVocabulary.blankToNull(body.note()));
        post.setTitle(FlatmateVocabulary.blankToNull(body.title()));
        post.setLocalities(localities.canonicalNames(clean(body.localities()), post.getLocalities()));
        post.setMoveIn(FlatmateVocabulary.blankToNull(body.moveIn()));
        post.setMoveInAt(parseMoveIn(body.moveIn()));
        if (body.verifiedContactOnly() != null) {
            post.setVerifiedContactOnly(body.verifiedContactOnly());
        }
    }

    private static Long budgetCeiling(FlatmateSeekerPostCreateRequest body) {
        Long ceiling = body.budgetMax();
        if (ceiling != null && ceiling < body.budget()) {
            throw new ValidationException(
                    "The top of your budget cannot be below the bottom of it.");
        }
        return ceiling;
    }

    static List<String> clean(List<String> values) {
        if (values == null) {
            return new ArrayList<>();
        }
        return values.stream().map(FlatmateVocabulary::blankToNull)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
    }

    private static LocalDate parseMoveIn(String moveIn) {
        String value = FlatmateVocabulary.blankToNull(moveIn);
        return value == null ? null : switch (value.toLowerCase(java.util.Locale.ROOT)) {
            case "now" -> LocalDate.now(PlatformTime.IST);
            case "15", "30", "60" -> LocalDate.now(PlatformTime.IST).plusDays(Long.parseLong(value));
            default -> {
                try {
                    yield LocalDate.parse(value);
                } catch (DateTimeParseException e) {
                    yield null;
                }
            }
        };
    }

    private static String pitch(String message, String intent) {
        String supplied = FlatmateVocabulary.blankToNull(message);
        if (supplied != null) {
            return supplied.length() > MAX_MESSAGE ? supplied.substring(0, MAX_MESSAGE) : supplied;
        }
        return switch (intent) {
            case "bring" -> "Hi! We are two of us looking together — is that alright?";
            case "match" -> "Hi! I'm interested, and happy to share the room with someone.";
            default -> "Hi! I'm interested in teaming up.";
        };
    }

    private static boolean isDuplicateInterest(DataIntegrityViolationException violation) {
        return ConstraintViolations.isOn(violation, ONE_PER_TARGET_INDEX);
    }

    private static ConflictException alreadyInterested() {
        return FlatmateConflicts.alreadyInterested(
                "You have already expressed interest in this post — your earlier message is with them.");
    }

    private void notify(UUID hostId, FlatmateSeekerPost post, User requester) {

        notifier.notify(
                hostId,
                "flatmate.interest",
                requester.getName() + " is interested in teaming up",
                "Open your request inbox to review their interest.",
                Notifier.REQUEST_INBOX);
        notifier.notify(
                requester.getId(),
                "flatmate.interest.sent",
                "Your message is with " + post.getName(),
                "If they accept, we will share your mobile number with them so they can reply. "
                        + "Nobody else on the board can see it.",
                FlatmateLinks.of("post", post.getId()));
    }

    private void notifyDecision(FlatmateRequest request, String verdict) {
        boolean accepted = "accepted".equals(verdict);
        notifier.notify(
                request.getRequesterId(),
                "flatmate.request." + verdict,
                accepted ? "Your flatmate request was accepted" : "Your flatmate request was declined",
                accepted
                        ? "Good news — the host accepted your request. They have your number."
                        : "The host has declined this one. Plenty of other people are looking.",
                FlatmateLinks.of(request.getKind(), request.getTargetId()));
    }
}
