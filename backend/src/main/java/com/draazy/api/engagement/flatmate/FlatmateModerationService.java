package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateModerationService {

    /** A {@code modStatus} value that names a board rather than a state — see {@link #moderationQueue}. */
    static final String SELECTOR_RECHECK = "recheck";

    private final FlatmateReviewRepository reviews;
    private final FlatmateGroupApplicationRepository applications;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateSeekerPostRepository posts;
    private final UserRepository users;
    private final GroupApplicationHydrator applicationHydrator;
    private final Notifier notifier;
    private final AuditService audit;
    private final PropertyRepository properties;
    private final RateLimitLock locks;

    public FlatmateModerationService(FlatmateReviewRepository reviews,
            FlatmateGroupApplicationRepository applications, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, FlatmateSeekerPostRepository posts,
            UserRepository users,
            GroupApplicationHydrator applicationHydrator,
            Notifier notifier, AuditService audit, PropertyRepository properties,
            RateLimitLock locks) {
        this.reviews = reviews;
        this.applications = applications;
        this.rooms = rooms;
        this.groups = groups;
        this.posts = posts;
        this.users = users;
        this.applicationHydrator = applicationHydrator;
        this.notifier = notifier;
        this.audit = audit;
        this.properties = properties;
        this.locks = locks;
    }

    /** Staff accounts are separate user rows, so this catches the one identity acting as maker and checker. */
    static void requireNotParty(AuthPrincipal caller, UUID... parties) {
        for (UUID party : parties) {
            if (caller.userId().equals(party)) {
                throw new ForbiddenException("You cannot moderate something you posted or are part of.");
            }
        }
    }

    /* The page is global: each source yields its first {@code (page + 1) * size} rows in the shared order,
       and the merge keeps the requested slice. */
    @Transactional(readOnly = true)
    public Page<FlatmateModerationRow> moderationQueue(List<String> kinds, List<String> modStatus,
            Pageable pageable) {
        List<String> requested = nonBlank(modStatus);
        boolean recheck = requested.contains(SELECTOR_RECHECK);
        List<String> states = modStates(
                requested.stream().filter(s -> !SELECTOR_RECHECK.equals(s)).toList(),
                recheck ? null : FlatmateVocabulary.MOD_PENDING);
        List<String> wanted = nonBlank(kinds).stream()
                .map(k -> FlatmateVocabulary.require(k,
                        Set.of(FlatmateModerationQueueDto.KIND_POST,
                                FlatmateModerationQueueDto.KIND_ROOM,
                                FlatmateModerationQueueDto.KIND_GROUP), "kind"))
                .distinct().toList();
        if (wanted.isEmpty()) {
            throw new BadRequestException("kind is required.");
        }

        Sort.Order byAge = pageable.getSort().getOrderFor("createdAt");
        Sort.Direction direction = byAge == null ? Sort.Direction.ASC : byAge.getDirection();
        int window = (int) Math.min((pageable.getPageNumber() + 1L) * pageable.getPageSize(),
                Integer.MAX_VALUE);
        Sort tieBreak = Sort.by(direction, "id");
        Pageable stateWindow = PageRequest.of(0, window, pageable.getSort().and(tieBreak));
        Pageable recheckWindow = PageRequest.of(0, window,
                Sort.by(direction, "recheck.requestedAt").and(tieBreak));

        List<Aged> candidates = new java.util.ArrayList<>();
        long total = 0;
        for (String kind : wanted) {
            if (!states.isEmpty()) {
                Page<FlatmateModerationQueueDto> page = byStates(kind, states, stateWindow);
                page.forEach(d -> candidates.add(new Aged(d.createdAt(), d)));
                total += page.getTotalElements();
            }
            if (recheck) {
                Page<FlatmateModerationQueueDto> page = byRecheck(kind, recheckWindow);
                page.forEach(d -> candidates.add(new Aged(d.recheckRequestedAt(), d)));
                total += page.getTotalElements();
            }
        }
        // Ids compare as strings: lowercase UUID text sorts like Postgres' unsigned byte order, so the merge
        // ranks ties exactly as each DB window did.
        Comparator<Aged> order = Comparator.comparing(Aged::at, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(a -> String.valueOf(a.item().id()));
        candidates.sort(direction.isAscending() ? order : order.reversed());

        List<FlatmateModerationRow> slice = candidates.stream()
                .skip(pageable.getOffset()).limit(pageable.getPageSize())
                .map(a -> FlatmateModerationRow.of(a.item())).toList();
        return new PageImpl<>(slice, pageable, total);
    }

    /** A row and the instant it is ranked by: its creation, or for a re-check the edit that raised it. */
    private record Aged(Instant at, FlatmateModerationQueueDto item) {
    }

    private static final List<String> PUBLISHED = List.of("approved", "live");
    private static final List<String> HIDDEN = List.of("flagged", "removed", "rejected",
            FlatmateVocabulary.MOD_EXPIRED);

    /** One card per awaiting post or application on Pending; badge claims are counted apart, as the
     * Badge requests tab lists them on their own. */
    @Transactional(readOnly = true)
    public FlatmateModerationSummary moderationSummary() {
        List<String> pending = List.of(FlatmateVocabulary.MOD_PENDING);
        long awaiting = posts.countByModStatusInAndArchivedFalse(pending)
                + posts.countByRecheckRequestedAtNotNullAndArchivedFalse()
                + rooms.countByModStatusInAndArchivedFalse(pending)
                + rooms.countByRecheckRequestedAtNotNullAndArchivedFalse()
                + groups.countByModStatusInAndArchivedFalse(pending)
                + groups.countByRecheckRequestedAtNotNullAndArchivedFalse()
                + applications.countByModStatusIn(pending);
        return new FlatmateModerationSummary(awaiting, reviews.countPendingClaims(),
                decided(PUBLISHED), decided(HIDDEN));
    }

    private long decided(List<String> states) {
        return posts.countByModStatusInAndArchivedFalse(states)
                + rooms.countByModStatusInAndArchivedFalse(states)
                + groups.countByModStatusInAndArchivedFalse(states)
                + applications.countByModStatusIn(states);
    }
    private Page<FlatmateModerationQueueDto> byStates(String kind, List<String> states,
            Pageable pageable) {
        return switch (kind) {
            case FlatmateModerationQueueDto.KIND_POST ->
                    presentPosts(posts.findByModStatusInAndArchivedFalse(states, pageable));
            case FlatmateModerationQueueDto.KIND_ROOM ->
                    presentRooms(rooms.findByModStatusInAndArchivedFalse(states, pageable));
            default -> presentGroups(groups.findByModStatusInAndArchivedFalse(states, pageable));
        };
    }

    private Page<FlatmateModerationQueueDto> byRecheck(String kind, Pageable pageable) {
        return switch (kind) {
            case FlatmateModerationQueueDto.KIND_POST ->
                    presentPosts(posts.findByRecheckRequestedAtNotNullAndArchivedFalse(pageable));
            case FlatmateModerationQueueDto.KIND_ROOM ->
                    presentRooms(rooms.findByRecheckRequestedAtNotNullAndArchivedFalse(pageable));
            default -> presentGroups(groups.findByRecheckRequestedAtNotNullAndArchivedFalse(pageable));
        };
    }

    private Page<FlatmateModerationQueueDto> presentPosts(Page<FlatmateSeekerPost> page) {
        Map<UUID, User> names = peopleOf(
                page.getContent().stream().map(FlatmateSeekerPost::getUserId).toList());
        return page.map(p -> FlatmateModerationQueueDto.of(p, names.get(p.getUserId())));
    }

    private Page<FlatmateModerationQueueDto> presentRooms(Page<FlatmateRoom> page) {
        Map<UUID, User> names = peopleOf(
                page.getContent().stream().map(FlatmateRoom::getHostId).toList());
        return page.map(r -> FlatmateModerationQueueDto.of(r, names.get(r.getHostId())));
    }

    private Page<FlatmateModerationQueueDto> presentGroups(Page<FlatmateGroup> page) {
        Map<UUID, User> names = peopleOf(
                page.getContent().stream().map(FlatmateGroup::getHostId).toList());
        return page.map(g -> FlatmateModerationQueueDto.of(g, names.get(g.getHostId())));
    }

    private static List<String> nonBlank(List<String> values) {
        return values == null ? List.of() : values.stream()
                .map(FlatmateVocabulary::blankToNull).filter(java.util.Objects::nonNull).toList();
    }

    /** {@code expired} is filterable but never a verdict: only the host's renewal leaves it. */
    private static List<String> modStates(List<String> requested, String fallback) {
        if (requested.isEmpty()) {
            return fallback == null ? List.of() : List.of(fallback);
        }
        return requested.stream()
                .map(s -> FlatmateVocabulary.MOD_EXPIRED.equals(s) ? s
                        : FlatmateVocabulary.require(s, FlatmateVocabulary.MOD_STATUS, "modStatus"))
                .distinct().toList();
    }

    /** Authors for one page, in one query rather than one per row. */
    private Map<UUID, User> peopleOf(List<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return users.findAllById(userIds.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
    }

    /** The id may name a post, a room or a group, since an abuse report carries an id, not a taxonomy.
     * Re-stamping the current state is "Looks fine": it only drops the pending re-check. */
    @Transactional
    public void moderate(AuthPrincipal caller, UUID targetId, String modStatus, String note) {
        String requested = FlatmateVocabulary.require(
                modStatus == null ? "" : modStatus.strip(),
                FlatmateVocabulary.MOD_STATUS, "modStatus");
        String verdict = FlatmateVocabulary.MOD_LIVE.equals(requested)
                ? FlatmateVocabulary.MOD_APPROVED : requested;
        String why = FlatmateVocabulary.blankToNull(note);

        Moderated item = posts.findLockedById(targetId)
                .map(p -> new Moderated(p, "flatmateSeekerPost", "post", p.getUserId()))
                .or(() -> rooms.findLockedById(targetId)
                        .map(r -> new Moderated(r, "flatmateRoom", "room", r.getHostId())))
                .or(() -> groups.findLockedById(targetId)
                        .map(g -> new Moderated(g, "flatmateGroup", "group", g.getHostId())))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        requireNotParty(caller, item.post() instanceof FlatmateGroup g ? g.parties() : new UUID[] {item.authorId()});

        FlatmateModerated post = item.post();
        String before = post.getModStatus();
        if (FlatmateVocabulary.MOD_EXPIRED.equals(before) && !"removed".equals(verdict)) {
            throw new ConflictException("This post has expired; the host must renew it.");
        }
        boolean stateChanges = !verdict.equals(before);
        if (!stateChanges && post.getRecheck().getRequestedAt() == null) {
            return;
        }
        if (stateChanges && why == null && (HIDING.contains(verdict) || UNDOING.contains(before))) {
            throw new BadRequestException("Add a note saying why — it is kept on the audit trail.");
        }

        post.setModStatus(verdict);
        post.getRecheck().clear();
        boolean published = FlatmateVocabulary.isPublic(verdict) && !FlatmateVocabulary.isPublic(before);
        if (published) {
            post.getExpiry().restart();
        }
        posts.flush();

        tellAuthor(item, targetId, before, verdict);

        audit.record(caller, stateChanges ? "flatmate.moderate" : "flatmate.recheck.clear",
                item.auditKind(), targetId.toString(),
                "from", before, "modStatus", verdict, "note", why);
    }

    /** Hiding, and undoing a removal or rejection, are the verdicts a later moderator must be able to explain. */
    private static final Set<String> HIDING = Set.of("flagged", "removed", "rejected");
    private static final Set<String> UNDOING = Set.of("removed", "rejected");

    private record Moderated(FlatmateModerated post, String auditKind, String linkKind, UUID authorId) {
    }

    private void tellAuthor(Moderated item, UUID targetId, String before, String verdict) {
        boolean wasPublic = FlatmateVocabulary.isPublic(before);
        boolean isPublic = FlatmateVocabulary.isPublic(verdict);
        String link = FlatmateLinks.of(item.linkKind(), targetId);
        if (isPublic && !wasPublic) {
            notifier.notify(item.authorId(), "flatmate.moderated.live", "Your flatmate ad is live",
                    "People can now see it and contact you.", link);
        } else if (!verdict.equals(before) && ("rejected".equals(verdict) || "removed".equals(verdict))) {
            notifier.notify(item.authorId(), "flatmate.moderated." + verdict,
                    "Your flatmate ad is not live",
                    "It did not pass our review. Edit it to follow our posting rules, or contact support from Help.",
                    link);
        }
    }

    @Transactional(readOnly = true)
    public Page<GroupApplicationDto> applications(List<String> modStatus, Pageable pageable) {
        List<String> states = modStates(nonBlank(modStatus), null);
        Page<FlatmateGroupApplication> page = states.isEmpty()
                ? applications.findByOrderByCreatedAtDesc(pageable)
                : applications.findByModStatusIn(states, pageable);
        List<GroupApplicationDto> hydrated = applicationHydrator.hydrateForStaff(page.getContent());
        return new PageImpl<>(hydrated, page.getPageable(), page.getTotalElements());
    }

    /** Writes {@code modStatus} only: "we took this down" and "the owner said no" are different
     * facts. {@link FlatmateGroupApplication#moderate} cannot reach {@code status} at all. */
    @Transactional
    public GroupApplicationDto moderateApplication(AuthPrincipal caller, UUID applicationId,
            String modStatus, String note) {
        String verdict = FlatmateVocabulary.require(
                modStatus == null ? "" : modStatus.strip(),
                FlatmateVocabulary.MOD_STATUS, "modStatus");

        UUID listingId = applications.findListingId(applicationId)
                .orElseThrow(() -> NotFoundException.of("Group application"));
        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_LISTING_DECISION, listingId.toString());
        FlatmateGroupApplication application = applications.findById(applicationId)
                .orElseThrow(() -> NotFoundException.of("Group application"));
        UUID listingOwner = properties.findById(listingId)
                .map(p -> p.getOwner() == null ? null : p.getOwner().getId()).orElse(null);
        requireNotParty(caller, application.getApplicantId(), listingOwner);
        groups.findById(application.getGroupId()).ifPresent(g -> requireNotParty(caller, g.parties()));
        String why = FlatmateVocabulary.blankToNull(note);
        String before = application.getModStatus();
        if (verdict.equals(before)) {
            return applicationHydrator.hydrateOneForStaff(application);
        }
        if (why == null && (HIDING.contains(verdict) || UNDOING.contains(before))) {
            throw new BadRequestException("Add a note saying why — it is kept on the audit trail.");
        }
        boolean restoringAccepted = FlatmateVocabulary.STATUS_ACCEPTED.equals(application.getStatus())
                && FlatmateVocabulary.isPublic(verdict) && !FlatmateVocabulary.isPublic(before);
        if (restoringAccepted && applications.existsByListingIdAndStatusAndModStatusInAndIdNot(listingId,
                FlatmateVocabulary.STATUS_ACCEPTED, FlatmateVocabulary.MOD_PUBLIC, applicationId)) {
            throw new ConflictException("The owner has accepted another group for this flat since.");
        }
        if (restoringAccepted && groups.lockVisible(application.getGroupId()).isEmpty()) {
            throw new ConflictException("This group is not live right now, so it cannot be restored.");
        }
        application.moderate(verdict, why);
        applications.saveAndFlush(application);

        audit.record(caller, "flatmate.groupApplication.moderate", "flatmateGroupApplication",
                application.getId().toString(), "from", before, "modStatus", verdict, "note", why);
        return applicationHydrator.hydrateOneForStaff(application);
    }
}
