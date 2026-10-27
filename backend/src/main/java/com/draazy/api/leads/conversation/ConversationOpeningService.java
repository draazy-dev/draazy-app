package com.draazy.api.leads.conversation;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.persistence.ConstraintViolations;
import com.draazy.api.common.trust.FlatmateRequestParties;
import com.draazy.api.common.trust.LeadIntroductions;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.leads.contact.ContactRequestStatuses;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// `ConversationService` owns the thread afterwards: the inbox, the replies, the attachments, the read marks.
// This one owns the admission decision — the relationship guard, the counterparty derivation.
@Service
public class ConversationOpeningService {

    private static final Logger log = LoggerFactory.getLogger(ConversationOpeningService.class);

    // Named constraints let us distinguish business conflicts from schema defects.
    private static final String PAIR_PROPERTY_INDEX = "uq_conversations_pair_property";
    private static final String PAIR_GENERAL_INDEX = "uq_conversations_pair_general";

    private final LongAdder racesRetried = new LongAdder();

    private final ConversationRepository conversations;
    private final ConversationMapper mapper;
    private final UserRepository users;
    private final PropertyRepository properties;
    private final ContactRequestRepository contactRequests;
    private final FlatmateRequestParties flatmateRequests;
    private final List<LeadIntroductions> introductions;
    private final AuditService audit;

    // The thread itself, for the one thing opening cannot do alone: put the caller's first message in it.
    private final ConversationService thread;

    private final TransactionTemplate transactions;

    public ConversationOpeningService(ConversationRepository conversations,
            ConversationMapper mapper, UserRepository users, PropertyRepository properties,
            ContactRequestRepository contactRequests, FlatmateRequestParties flatmateRequests,
            List<LeadIntroductions> introductions, AuditService audit,
            ConversationService thread, PlatformTransactionManager transactionManager) {
        this.conversations = conversations;
        this.mapper = mapper;
        this.users = users;
        this.properties = properties;
        this.contactRequests = contactRequests;
        this.flatmateRequests = flatmateRequests;
        this.introductions = List.copyOf(introductions);
        this.audit = audit;
        this.thread = thread;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public Started start(AuthPrincipal caller, ConversationCreate body) {
        return retryingPairRace(caller, () -> openOrResume(caller, body));
    }

    public ConversationDto openForFlatmateRequest(AuthPrincipal caller, String requestId) {
        FlatmateRequestParties.Pair pair = Ids.parseUuid(requestId)
                .flatMap(id -> flatmateRequests.chattable(id, caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate chat"));
        return retryingPairRace(caller, () -> findOrCreatePair(caller, pair));
    }

    public ConversationDto openForLeadRequest(AuthPrincipal caller, String kind, String requestId) {
        LeadIntroductions.Pair pair = introductions.stream().filter(lead -> lead.kind().equals(kind)).findFirst()
                .flatMap(lead -> Ids.parseUuid(requestId).flatMap(id -> lead.chattable(id, caller.userId())))
                .filter(this::stillReachable)
                .orElseThrow(() -> NotFoundException.of("Request chat"));
        return retryingPairRace(caller, () -> findOrCreateListingPair(caller, pair));
    }

    private boolean stillReachable(LeadIntroductions.Pair pair) {
        return properties.findById(pair.propertyId()).filter(p -> !p.isOwnerSuspended()).isPresent()
                && users.findById(pair.counterparty()).filter(u -> !u.isArchived()).isPresent();
    }

    private ConversationDto findOrCreateListingPair(AuthPrincipal caller, LeadIntroductions.Pair pair) {
        UUID me = caller.userId();
        UUID them = pair.counterparty();
        boolean ordered = Conversation.ordersFirst(me, them);
        Conversation conversation = conversations.findPair(ordered ? me : them, ordered ? them : me, pair.propertyId())
                .orElseGet(() -> conversations.saveAndFlush(new Conversation(me, them, pair.propertyId(), null)));
        return mapper.toSummaries(List.of(conversation), me).getFirst();
    }

    private <T> T retryingPairRace(AuthPrincipal caller, Supplier<T> attempt) {
        try {
            return transactions.execute(tx -> attempt.get());
        } catch (DataIntegrityViolationException raced) {
            if (!isPairRace(raced) || TransactionSynchronizationManager.isActualTransactionActive()) {

                // Not our collision, or we are inside somebody else's transaction and a retry
                // cannot work. Either way the honest answer is the one the client already had.
                throw raced;
            }
            log.info("Concurrent first message lost the conversation find-or-create race for {};"
                    + " handing over the thread the winner created", caller.userId());
            racesRetried.increment();
            return transactions.execute(tx -> attempt.get());
        }
    }

    private ConversationDto findOrCreatePair(AuthPrincipal caller, FlatmateRequestParties.Pair accepted) {
        UUID me = caller.userId();
        UUID them = accepted.counterparty();
        boolean ordered = Conversation.ordersFirst(me, them);
        Optional<Conversation> existing = conversations.findPair(
                ordered ? me : them, ordered ? them : me, null);
        Conversation conversation = existing.orElseGet(() ->
                conversations.saveAndFlush(new Conversation(me, them, null, null)));
        // Guarded so re-opening the same post does not bump updatedAt and reorder the inbox.
        if (!accepted.targetId().equals(conversation.getFlatmateTargetId())) {
            conversation.aboutFlatmate(accepted.targetKind(), accepted.targetId());
        }
        if (existing.isEmpty() && Roles.isBackOffice(caller.role())) {
            audit.record(caller, "conversation.started", "conversation",
                    conversation.getId().toString(), "counterparty", them.toString());
        }
        return mapper.toSummaries(List.of(conversation), me).getFirst();
    }

    // A test that cannot tell those apart silently stops testing this method the first time the timing shifts.
    // Race tests need to distinguish an actual retry from accidental serialization.
    long racesRetried() {
        return racesRetried.sum();
    }

    // Anything else (a foreign key, a not-null, the ordering CHECK) is a bug in this method.
    private static boolean isPairRace(DataIntegrityViolationException violation) {
        return ConstraintViolations.isOn(violation, PAIR_PROPERTY_INDEX)
                || ConstraintViolations.isOn(violation, PAIR_GENERAL_INDEX);
    }

    private Started openOrResume(AuthPrincipal caller, ConversationCreate body) {
        Property listing = null;
        if (body.propertyId() != null && !body.propertyId().isBlank()) {
            listing = Ids.parseUuid(body.propertyId())
                    .flatMap(properties::findById)
                    .or(() -> properties.findBySlug(body.propertyId()))
                    .filter(p -> !p.isOwnerSuspended())
                    .orElseThrow(ConversationOpeningService::refuse);
        }
        UUID propertyId = listing == null ? null : listing.getId();

        User counterparty = body.counterpartyMobile() == null || body.counterpartyMobile().isBlank()
                ? ownerOf(listing, caller)
                : users.findByMobileAndArchivedFalse(
                                MobileMask.normalise(body.counterpartyMobile()))
                        .filter(u -> !u.getId().equals(caller.userId()))
                        .orElseThrow(ConversationOpeningService::refuse);
        if (listing != null) {

            if (listing.getOwner() == null
                    || !(listing.getOwner().getId().equals(caller.userId())
                            || listing.getOwner().getId().equals(counterparty.getId()))) {
                throw refuse();
            }
        }
        if (!related(caller, counterparty.getId(), listing)) {
            throw refuse();
        }

        UUID me = caller.userId();
        UUID them = counterparty.getId();

        // Same ordering rule as the constructor and the the database CHECK -- see Conversation.ordersFirst
        // for why UUID.compareTo is the wrong comparator here.
        boolean ordered = Conversation.ordersFirst(me, them);
        Optional<Conversation> existing = conversations.findPair(
                ordered ? me : them, ordered ? them : me, propertyId);

        Conversation conversation = existing.orElseGet(() ->
                conversations.saveAndFlush(new Conversation(me, them, propertyId, null)));
        thread.send(conversation, caller, body.body(),
                body.clientId() == null || body.clientId().isBlank() ? null : body.clientId().trim(), null);
        if (existing.isEmpty() && Roles.isBackOffice(caller.role())) {
            audit.record(caller, "conversation.started", "conversation",
                    conversation.getId().toString(),
                    "counterparty", them.toString(),
                    "property", propertyId == null ? null : propertyId.toString());
        }
        return new Started(mapper.toDetail(conversation, me), existing.isEmpty());
    }

    // Consent is per listing: an approved contact request, a confirmed visit or an accepted offer. A thread without
    // a listing is only for staff or an owner writing to someone who has an approved request on one of their listings.
    private boolean related(AuthPrincipal caller, UUID counterpartyId, Property listing) {
        if (Roles.isBackOffice(caller.role())) {
            return true;
        }
        if (listing == null) {
            return contactRequests.existsApprovedForOwner(
                    counterpartyId, caller.userId(), ContactRequestStatuses.APPROVED);
        }
        UUID requester = listing.getOwner().getId().equals(caller.userId()) ? counterpartyId : caller.userId();
        return contactRequests.existsByRequesterIdAndPropertyIdAndStatus(
                requester, listing.getId(), ContactRequestStatuses.APPROVED)
                || introductions.stream().anyMatch(lead -> lead.introduces(requester, listing.getId()));
    }

    // The relationship guard still runs later; this lookup proves nothing alone.
    private User ownerOf(Property listing, AuthPrincipal caller) {
        if (listing == null || listing.getOwner() == null) {
            throw refuse();
        }
        User owner = listing.getOwner();
        if (owner.isArchived() || owner.getId().equals(caller.userId())) {
            throw refuse();
        }
        return owner;
    }

    // All start refusals share one response to avoid user enumeration.
    private static ForbiddenException refuse() {
        return new ForbiddenException(
                "You can only message people you already have an approved contact with.");
    }

    public record Started(ConversationDto conversation, boolean created) {
    }
}
