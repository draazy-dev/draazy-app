package com.draazy.api.leads.contact;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ContactPendingLimitException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.ContactQuotaExhaustedException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.VerificationRequiredException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.ContactAllowanceLookup;
import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.ReferralTriggers;
import com.draazy.api.common.trust.VerifiedTenantLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContactService {

    private final ContactRequestRepository contactRequests;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final ContactMapper contactMapper;
    private final Notifier notifier;
    private final VerifiedTenantLookup verifiedTenants;
    private final ContactAllowanceLookup allowances;
    private final RateLimitLock locks;
    private final ReferralTriggers referralTriggers;
    private final ContactReplyWindow window;
    private final ContactReturns returnedContact;
    private final PlatformSettings settings;
    private final ContactUsageService usage;

    public ContactService(ContactRequestRepository contactRequests, PropertyRepository properties,
            UserRepository users, ContactMapper contactMapper, Notifier notifier,
            VerifiedTenantLookup verifiedTenants, ContactAllowanceLookup allowances, RateLimitLock locks, ReferralTriggers referralTriggers,
            ContactReplyWindow window, ContactReturns returnedContact, PlatformSettings settings,
            ContactUsageService usage) {
        this.contactRequests = contactRequests;
        this.properties = properties;
        this.users = users;
        this.contactMapper = contactMapper;
        this.notifier = notifier;
        this.verifiedTenants = verifiedTenants;
        this.allowances = allowances;
        this.locks = locks;
        this.referralTriggers = referralTriggers;
        this.window = window;
        this.returnedContact = returnedContact;
        this.settings = settings;
        this.usage = usage;
    }

    @Transactional(readOnly = true)
    public ContactStatusResponse status(UUID viewerId, String propertyId) {
        return describe(viewerId, resolve(propertyId));
    }

    // Idempotent.
    @Transactional
    public ContactStatusResponse request(UUID viewerId, ContactRequestCreate body) {
        Property property = resolve(body.propertyId());
        User owner = property.getOwner();

        if (owner != null && owner.getId().equals(viewerId)) {
            return describe(viewerId, property);
        }
        if (!property.isPubliclyVisible()) {
            throw closedListing(property);
        }
        if (owner != null && owner.isVerifiedContactOnly() && !hasBadge(viewerId)) {
            throw new VerificationRequiredException("This owner only accepts verified contacts");
        }

        // Serialises one buyer's requests so the allowance count is never read stale and a parallel duplicate
        // finds the winner's row instead of tripping the unique key, which would abort this transaction.
        locks.holdUntilCommit(RateLimitLock.Limit.CONTACT_REQUEST, viewerId.toString());
        Optional<ContactRequest> existing =
                contactRequests.findByRequesterIdAndPropertyId(viewerId, property.getId());
        Instant now = Instant.now();
        if (existing.isEmpty()) {
            requireRoomForAnotherRequest(viewerId, property.getId(), now);
            contactRequests.saveAndFlush(new ContactRequest(property.getId(), viewerId, body.message()));
            announceToOwner(owner, viewerId, property);
        } else if (window.lapsed(existing.get().getStatus(), existing.get().getCreatedAt(), now)) {

            // A lapsed request does not count, so asking again is a new spend and is checked as one.
            requireRoomForAnotherRequest(viewerId, property.getId(), now);
            if (contactRequests.renewIfLapsed(existing.get().getId(), body.message(), now,
                    window.cutoff(now)) > 0) {
                announceToOwner(owner, viewerId, property);
            }
        }

        return describe(viewerId, property);
    }

    // Name only: the requester's mobile stays behind the gate the owner is being asked to open.
    private void announceToOwner(User owner, UUID requesterId, Property property) {
        if (owner == null) {
            return;
        }
        String name = users.findById(requesterId).map(User::getName)
                .filter(n -> !n.isBlank()).orElse("Someone");
        notifier.notify(owner.getId(), "contact.received",
                "New contact request",
                name + " wants to contact you about " + property.getTitle() + ". Approve or decline it.",
                "/dashboard#leads");
    }

    // A visit reaches the owner just as a contact request does, so it spends from the same allowance.
    @Transactional
    public void requireRoomForVisit(UUID viewerId, UUID propertyId) {
        locks.holdUntilCommit(RateLimitLock.Limit.CONTACT_REQUEST, viewerId.toString());
        requireRoomForAnotherRequest(viewerId, propertyId, Instant.now());
    }

    // A listing already reached by a request or a visit costs nothing more.
    private void requireRoomForAnotherRequest(UUID viewerId, UUID propertyId, Instant now) {
        ContactUsageService.Uses uses = usage.uses(viewerId, window.cutoff(now));
        if (uses.spentAt().containsKey(propertyId)) {
            return;
        }
        int open = uses.awaitingReply().size();
        if (open >= settings.contactPendingMax()) {
            throw new ContactPendingLimitException("You already have " + open + " requests waiting for an owner's reply."
                    + " Wait for a reply or for a request to lapse, or cancel a visit you no longer need.");
        }
        OptionalInt remaining = allowances.contactsRemaining(viewerId);
        if (remaining.isPresent() && remaining.getAsInt() <= 0) {
            throw new ContactQuotaExhaustedException(
                    "You have used all your owner contacts. "
                            + "Buy a contact pack, or refer a friend to earn more.");
        }
    }

    @Transactional(readOnly = true)
    public Page<ContactRequestResponse> myRequests(UUID ownerId, Pageable pageable) {
        List<UUID> ownedPropertyIds = properties.findIdsByOwnerId(ownerId);
        if (ownedPropertyIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Page<ContactRequest> rows =
                contactRequests.findByPropertyIdInOrderByCreatedAtDesc(ownedPropertyIds, pageable);
        Map<UUID, User> requesters = users.findAllById(
                        rows.getContent().stream()
                                .map(ContactRequest::getRequesterId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        // One extra query for the whole page, not one per row. The badge rides on the party because
        // the mobile the owner receives is masked, so the client cannot derive this answer itself.
        Set<UUID> verifiedIds = verifiedTenants.verifiedAmong(requesters.keySet());

        Instant now = Instant.now();
        return rows.map(row -> withDerivedStatus(contactMapper.toResponse(
                row, requesters.get(row.getRequesterId()), visibilityOf(row.getStatus()),
                verifiedIds), row, now));
    }

    @Transactional
    public void respond(AuthPrincipal owner, String reqId, StatusUpdate body) {
        ContactRequest row = Ids.parseUuid(reqId)
                .flatMap(contactRequests::findById)
                .filter(r -> properties.findByIdAndOwner_Id(
                        r.getPropertyId(), owner.userId()).isPresent())
                .orElseThrow(() -> NotFoundException.of("Contact request"));

        String before = row.getStatus();
        if (window.lapsed(before, row.getCreatedAt(), Instant.now())) {
            throw new ConflictException("This contact request has expired");
        }
        if (ContactRequestStatuses.APPROVED.equals(body.status()) && !listingIsLive(row.getPropertyId())) {
            throw new ConflictException(ErrorCodes.LISTING_NOT_LIVE, "This listing is not live, so its contact cannot be shared");
        }
        if (body.status().equals(before)) {
            return;
        }
        if (!ContactRequestStatuses.canTransition(row.getStatus(), body.status())) {
            throw new ConflictException("This contact request has already been answered");
        }
        if (contactRequests.updateStatusIfCurrent(
                row.getId(), ContactRequestStatuses.PENDING, body.status()) == 0) {
            ContactRequest current = contactRequests.findById(row.getId())
                    .orElseThrow(() -> NotFoundException.of("Contact request"));
            if (body.status().equals(current.getStatus())) {
                return;
            }
            throw new ConflictException("This contact request has already been answered");
        }

        if (ContactRequestStatuses.APPROVED.equals(body.status())) {
            notifier.notify(
                    row.getRequesterId(),
                    "contact.approved",
                    "Your contact request was approved",
                    "You can now message the owner and see their number unless they keep it hidden \u2014 open the listing.",
                    "/property/" + row.getPropertyId());
            referralTriggers.contactAccepted(
                    row.getRequesterId(), owner.userId(), row.getPropertyId(), Instant.now());
        } else {
            returnedContact.notifySeeker(row, "declined");
        }
    }

    // A listing a visitor can still open (paused, rented, sold) is closed; anything else is not visible to the caller.
    private static RuntimeException closedListing(Property property) {
        boolean reachable = !property.isArchived() && !property.isOwnerSuspended()
                && PropertyStatus.DIRECTLY_REACHABLE.contains(property.getStatus());
        return reachable
                ? new ConflictException(ErrorCodes.LISTING_NOT_LIVE, "This listing is not live right now")
                : NotFoundException.of("Property");
    }

    private boolean listingIsLive(UUID propertyId) {
        return properties.findById(propertyId).map(Property::isPubliclyVisible).orElse(false);
    }

    // An owner is never blocked from their own contact by their own opt-in.
    private ContactStatusResponse describe(UUID viewerId, Property property) {
        User owner = property.getOwner();
        boolean verifiedContactOnly = owner != null && owner.isVerifiedContactOnly();

        if (owner != null && owner.getId().equals(viewerId)) {
            return new ContactStatusResponse(ContactStatuses.OWNER, verifiedContactOnly, false, false);
        }
        String status = contactRequests.findByRequesterIdAndPropertyId(viewerId, property.getId())
                .map(row -> window.lapsed(row.getStatus(), row.getCreatedAt(), Instant.now())
                        ? ContactStatuses.EXPIRED : row.getStatus())
                .orElse(ContactStatuses.NONE);
        return new ContactStatusResponse(
                status, verifiedContactOnly, verifiedContactOnly && !hasBadge(viewerId),
                owner != null && owner.isHideNumber());
    }

    // Read verification live so old tokens do not block newly verified users.
    private boolean hasBadge(UUID userId) {
        return users.findById(userId).map(User::isVerified).orElse(false);
    }

    private ContactVisibility visibilityOf(String status) {
        return ContactStatuses.revealsContact(status)
                ? ContactVisibility.REVEALED : ContactVisibility.MASKED;
    }

    private ContactRequestResponse withDerivedStatus(
            ContactRequestResponse response, ContactRequest row, Instant now) {
        if (!window.lapsed(row.getStatus(), row.getCreatedAt(), now)) {
            return response;
        }
        return new ContactRequestResponse(response.id(), response.propertyId(), response.requester(),
                ContactRequestStatuses.EXPIRED, response.contact(), response.createdAt());
    }

    // Accept UUID or slug here because the property-detail contract accepts both.
    private Property resolve(String idOrSlug) {
        return Ids.parseUuid(idOrSlug)
                .flatMap(properties::findById)
                .or(() -> properties.findBySlug(idOrSlug))
                .orElseThrow(() -> NotFoundException.of("Property"));
    }
}
