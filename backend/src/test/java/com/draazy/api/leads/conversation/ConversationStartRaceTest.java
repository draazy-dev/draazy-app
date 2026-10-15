package com.draazy.api.leads.conversation;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.leads.contact.ContactRequestStatuses;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.IntFunction;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;

/** Two first messages sent at the same moment leave one thread and no errors. */
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Two first messages in one thread, sent together")
class ConversationStartRaceTest {

    /** The test pool has four connections and the winner holds two at once. */
    private static final int RACERS = 2;

    private static final int RACE_ATTEMPTS = 8;

    @Autowired ConversationOpeningService conversations;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ContactRequestRepository contactRequests;
    @Autowired JdbcTemplate jdbc;

    private User buyer;
    private User owner;
    private UUID propertyId;

    @BeforeEach
    void setUp() {
        buyer = saveUser("9876000390", "Race Buyer");
        owner = saveUser("9876000391", "Race Owner");
        Property listing = properties.saveAndFlush(new Property(
                owner, "Race listing", "rent", "flat", 25_000L, "Baner", "Pune"));
        propertyId = listing.getId();
        // A real approved request, so the racers take the real guard path.
        ContactRequest approved = new ContactRequest(propertyId, buyer.getId(), "interested");
        approved.setStatus(ContactRequestStatuses.APPROVED);
        contactRequests.saveAndFlush(approved);
    }

    @AfterEach
    void cleanUp() {
        if (buyer != null && owner != null) {
            jdbc.update("delete from messages where conversation_id in"
                    + " (select id from conversations where user_a_id in (?, ?)"
                    + " or user_b_id in (?, ?))",
                    buyer.getId(), owner.getId(), buyer.getId(), owner.getId());
            jdbc.update("delete from conversations where user_a_id in (?, ?)"
                    + " or user_b_id in (?, ?)",
                    buyer.getId(), owner.getId(), buyer.getId(), owner.getId());
            jdbc.update("delete from notifications where user_id in (?, ?)",
                    buyer.getId(), owner.getId());
        }
        if (propertyId != null) {
            jdbc.update("delete from contact_requests where property_id = ?", propertyId);
            jdbc.update("delete from properties where id = ?", propertyId);
        }
        // The started-thread audit row commits in its own REQUIRES_NEW transaction, so it outlives
        // the rollback of the losing attempt and has to be removed by hand.
        if (buyer != null && owner != null) {
            jdbc.update("delete from audit_log where actor in (?, ?)",
                    buyer.getId().toString(), owner.getId().toString());
        }
        for (User user : new User[] { buyer, owner }) {
            if (user != null) {
                jdbc.update("delete from users where id = ?", user.getId());
            }
        }
        buyer = null;
        owner = null;
        propertyId = null;
    }

    private User saveUser(String mobile, String name) {
        User user = new User(mobile, Roles.Wire.BUYER);
        user.setName(name);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private long countThreads() {
        Long n = jdbc.queryForObject(
                "select count(*) from conversations"
                        + " where (user_a_id = ? and user_b_id = ?)"
                        + " or (user_a_id = ? and user_b_id = ?)",
                Long.class, buyer.getId(), owner.getId(), owner.getId(), buyer.getId());
        return n == null ? 0 : n;
    }

    /** Messages in whatever thread the pair ended up with. */
    private long countMessages() {
        Long n = jdbc.queryForObject(
                "select count(*) from messages where conversation_id in"
                        + " (select id from conversations"
                        + " where (user_a_id = ? and user_b_id = ?)"
                        + " or (user_a_id = ? and user_b_id = ?))",
                Long.class, buyer.getId(), owner.getId(), owner.getId(), buyer.getId());
        return n == null ? 0 : n;
    }

    /** Nobody errors, one caller is told created, and one thread holds both messages. */
    private void assertOneThreadAndNoErrors(List<Throwable> outcomes, List<Boolean> created) {
        for (Throwable outcome : outcomes) {
            if (outcome != null) {
                throw new AssertionError(
                        "the loser of the find-or-create race must be handed the existing thread, "
                                + "not an error", outcome);
            }
        }
        assertThat(created.stream().filter(Boolean::booleanValue).count())
                .as("only one caller created anything, so only one may be told 201")
                .isEqualTo(1);
        assertThat(created)
                .as("the loser is told 200 — the thread it asked for, which already existed")
                .hasSize(RACERS);
        assertThat(countThreads())
                .as("the indexes exist so that one first message and two leave the same inbox")
                .isEqualTo(1);
        assertThat(countMessages())
                .as("the loser's message was re-sent by the retry, not swallowed by the collision")
                .isEqualTo(RACERS);
    }

    /** Re-runs until the retry fires: a serialised round looks identical to a successful retry. */
    private void raceUntilRetried(IntFunction<Boolean> racer) {
        long before = conversations.racesRetried();
        for (int attempt = 1; attempt <= RACE_ATTEMPTS; attempt++) {
            List<Boolean> created = new CopyOnWriteArrayList<>();
            List<Throwable> outcomes = Races.run(RACERS, index -> created.add(racer.apply(index)));
            assertOneThreadAndNoErrors(outcomes, created);
            if (conversations.racesRetried() > before) {
                return;
            }
            clearThreads();
        }
        throw new AssertionError("the find-or-create race never collided in " + RACE_ATTEMPTS
                + " attempts, so the D54 retry was never exercised — every attempt serialised, "
                + "which means this test no longer proves the fix works");
    }

    /** Remove the threads a serialised attempt left behind, so the next attempt starts empty. */
    private void clearThreads() {
        jdbc.update("delete from messages where conversation_id in"
                + " (select id from conversations where user_a_id in (?, ?)"
                + " or user_b_id in (?, ?))",
                buyer.getId(), owner.getId(), buyer.getId(), owner.getId());
        jdbc.update("delete from conversations where user_a_id in (?, ?)"
                + " or user_b_id in (?, ?)",
                buyer.getId(), owner.getId(), buyer.getId(), owner.getId());
        jdbc.update("delete from notifications where user_id in (?, ?)",
                buyer.getId(), owner.getId());
    }

    /** The double tap on a flaky connection: one account, one counterparty, two first messages. */
    @Test
    @DisplayName("a listing thread: the loser is handed the winner's thread, not a 409")
    void concurrentFirstMessagesLeaveOneThread() {
        AuthPrincipal caller = new AuthPrincipal(
                buyer.getId(), Roles.Wire.BUYER, null, true, false);
        ConversationCreate body = new ConversationCreate(
                owner.getMobile(), propertyId.toString(), "Is this still available?", null);

        raceUntilRetried(index -> conversations.start(caller, body).created());
    }

    /** Each party names the other; V22 canonicalises the pair, so both inserts hit one index entry. */
    @Test
    @DisplayName("both parties messaging each other at once still leaves one thread")
    void oppositeDirectionsLeaveOneThread() {
        AuthPrincipal fromBuyer = new AuthPrincipal(
                buyer.getId(), Roles.Wire.BUYER, null, true, false);
        AuthPrincipal fromOwner = new AuthPrincipal(
                owner.getId(), Roles.Wire.BUYER, null, true, false);
        ConversationCreate buyerSays = new ConversationCreate(
                owner.getMobile(), propertyId.toString(), "Is this still available?", null);
        ConversationCreate ownerSays = new ConversationCreate(
                buyer.getMobile(), propertyId.toString(), "Are you still looking?", null);

        raceUntilRetried(index -> {
            ConversationOpeningService.Started started = index == 0
                    ? conversations.start(fromBuyer, buyerSays)
                    : conversations.start(fromOwner, ownerSays);
            return started.created();
        });
    }
}
