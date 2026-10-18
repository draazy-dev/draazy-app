package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.common.trust.WithdrawnCooldown;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Group applications are not requests: a host binds the whole group to a listing. */
@Service
public class FlatmateApplicationService {

    private static final String CLOSED_TO_GROUPS =
            "This flat has already been given to a group and is closed to new group applications.";

    private final FlatmateGroupApplicationRepository applications;
    private final FlatmateGroupRepository groups;
    private final PropertyRepository properties;
    private final GroupApplicationHydrator hydrator;
    private final Notifier notifier;
    private final RateLimitLock locks;

    public FlatmateApplicationService(FlatmateGroupApplicationRepository applications,
            FlatmateGroupRepository groups, PropertyRepository properties,
            GroupApplicationHydrator hydrator, Notifier notifier,
            RateLimitLock locks) {
        this.applications = applications;
        this.groups = groups;
        this.properties = properties;
        this.hydrator = hydrator;
        this.notifier = notifier;
        this.locks = locks;
    }

    /** Host view: the card draws the moderation state and the seats; the edit form reads the one group it opens. */
    @Transactional(readOnly = true)
    public Page<FlatmateGroupCard> myGroups(AuthPrincipal caller, Pageable pageable) {
        return groups.findMine(caller.userId(), pageable).map(FlatmateApplicationService::card);
    }

    private static FlatmateGroupCard card(FlatmateGroup group) {
        List<String> localities = group.isHunting() && !group.getLocalities().isEmpty()
                ? List.copyOf(group.getLocalities())
                : group.getLocality() == null ? List.of() : List.of(group.getLocality());
        return new FlatmateGroupCard(group.getId(), group.getTitle(), group.getLocality(), localities,
                group.getRent(), group.getSeatsTotal(), group.openSeats(), group.getMembers().size(),
                group.getPropertyId(), group.getModStatus(), group.getCreatedAt());
    }

    /** Host-only, and a stranger's group id is a 404: applying binds every group member to a flat and rent. */
    @Transactional
    public GroupApplicationDto apply(AuthPrincipal caller, UUID groupId, UUID listingId) {
        FlatmateGroup group = groups.findById(groupId)
                .filter(g -> g.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate group"));
        if (!group.isVisible()) {
            throw new BadRequestException(
                    "This group is not live yet, so it cannot apply to a flat.");
        }

        Property listing = properties.findById(listingId)
                .orElseThrow(() -> NotFoundException.of("Listing"));
        if (!listing.isPubliclyVisible()) {
            throw new BadRequestException("That listing is not accepting enquiries.");
        }
        if (!DealIntent.RENT.equals(listing.getDeal())) {
            throw new BadRequestException("A group can only apply to a rental listing.");
        }
        if (listing.getOwner() != null && listing.getOwner().getId().equals(caller.userId())) {
            throw new BadRequestException("This is your own listing.");
        }
        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_LISTING_DECISION, listingId.toString());
        FlatmateGroupApplication earlier = applications.findByListingIdAndGroupId(listingId, groupId).orElse(null);
        if (earlier != null && !RequestSource.WITHDRAWN.equals(earlier.getStatus())) {
            throw new ConflictException(
                    "Your group has already applied to this flat — the owner has it.");
        }
        if (earlier != null && WithdrawnCooldown.active(earlier.getDecidedAt(), Instant.now())) {
            throw WithdrawnCooldown.refusal(earlier.getDecidedAt());
        }
        if (applications.existsByListingIdAndStatusAndModStatusIn(listingId,
                FlatmateVocabulary.STATUS_ACCEPTED, FlatmateVocabulary.MOD_PUBLIC)) {
            throw new ConflictException(CLOSED_TO_GROUPS);
        }

        FlatmateGroupApplication saved;
        if (earlier == null) {
            saved = applications.saveAndFlush(new FlatmateGroupApplication(listingId, groupId, caller.userId()));
        } else {
            earlier.reopen(caller.userId());
            saved = applications.saveAndFlush(earlier);
            applications.restartClock(saved.getId());
        }

        if (listing.getOwner() != null) {
            notifier.notify(listing.getOwner().getId(), "flatmate.groupApplication.received",
                    "A group applied to your flat",
                    group.getTitle() + " would like to rent " + listing.getTitle() + ".",
                    "/dashboard");
        }

        return hydrator.hydrateOne(saved);
    }

    /** Scope by owned listing ids because the application row has no owner column. */
    @Transactional(readOnly = true)
    public Page<GroupApplicationDto> inbox(AuthPrincipal caller, Pageable pageable) {
        List<UUID> listingIds = properties.findIdsByOwnerId(caller.userId());
        if (listingIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Page<FlatmateGroupApplication> page =
                applications.findByListingIdInAndModStatusInOrderByCreatedAtDesc(
                        listingIds, FlatmateVocabulary.MOD_PUBLIC, pageable);
        return new PageImpl<>(hydrator.hydrate(page.getContent()), page.getPageable(),
                page.getTotalElements());
    }

    /** Stranger ids return 404, not 403, so application ids do not become existence oracles. */
    @Transactional
    public GroupApplicationDto decide(AuthPrincipal caller, UUID applicationId, String status) {
        String verdict = FlatmateVocabulary.require(
                status == null ? "" : status.strip(), FlatmateVocabulary.DECISION, "status");

        FlatmateGroupApplication application = applications.findById(applicationId)
                .orElseThrow(() -> NotFoundException.of("Group application"));

        Property listing = properties.findById(application.getListingId())
                .filter(p -> p.getOwner() != null && p.getOwner().getId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Group application"));

        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_LISTING_DECISION,
                listing.getId().toString());
        if (!applications.existsByIdAndModStatusIn(application.getId(), FlatmateVocabulary.MOD_PUBLIC)) {
            throw new ConflictException("This application was taken down by our team.");
        }
        if (verdict.equals(application.getStatus())) {
            return hydrator.hydrateOne(application);
        }
        if (!FlatmateVocabulary.STATUS_PENDING.equals(application.getStatus())) {
            throw new ConflictException("You have already answered this application.");
        }

        boolean accepting = FlatmateVocabulary.STATUS_ACCEPTED.equals(verdict);
        if (accepting && groups.lockVisible(application.getGroupId()).isEmpty()) {
            throw new ConflictException("This group is not live right now, so it cannot be accepted.");
        }
        if (accepting && applications.existsByListingIdAndStatusAndModStatusInAndIdNot(listing.getId(),
                FlatmateVocabulary.STATUS_ACCEPTED, FlatmateVocabulary.MOD_PUBLIC, application.getId())) {
            throw new ConflictException(CLOSED_TO_GROUPS);
        }

        if (applications.updateDecisionIfPending(application.getId(),
                FlatmateVocabulary.STATUS_PENDING, verdict, Instant.now()) == 0) {
            FlatmateGroupApplication current = applications.findById(application.getId())
                    .orElseThrow(() -> NotFoundException.of("Group application"));
            if (verdict.equals(current.getStatus())) {
                return hydrator.hydrateOne(current);
            }
            throw new ConflictException("You have already answered this application.");
        }
        FlatmateGroupApplication decided = applications.findById(application.getId())
                .orElseThrow(() -> NotFoundException.of("Group application"));

        notifyVerdict(listing, decided, verdict);

        if (accepting) {
            declineOtherPending(listing, decided.getId());
        }
        return hydrator.hydrateOne(decided);
    }

    private void declineOtherPending(Property listing, UUID acceptedId) {
        for (FlatmateGroupApplication other : applications.findByListingIdAndStatus(
                listing.getId(), FlatmateVocabulary.STATUS_PENDING)) {
            if (!other.getId().equals(acceptedId) && applications.updateDecisionIfPending(other.getId(),
                    FlatmateVocabulary.STATUS_PENDING, "declined", Instant.now()) == 1) {
                notifyVerdict(listing, other, "declined");
            }
        }
    }

    private void notifyVerdict(Property listing, FlatmateGroupApplication application, String verdict) {
        boolean accepted = FlatmateVocabulary.STATUS_ACCEPTED.equals(verdict);
        notifier.notify(application.getApplicantId(), "flatmate.groupApplication." + verdict,
                accepted ? "Your group's application was accepted"
                        : "Your group's application was declined",
                accepted ? "The owner of " + listing.getTitle() + " accepted your group. "
                                + "They will be in touch to arrange the paperwork."
                        : "The owner of " + listing.getTitle() + " declined your group.",
                FlatmateLinks.of("group", application.getGroupId()));
    }
}
