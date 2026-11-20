package com.draazy.api.catalog;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.listing.ListingDuplicateProbe;
import com.draazy.api.catalog.property.AddressKey;
import com.draazy.api.catalog.property.Furnishing;
import com.draazy.api.catalog.property.MeterKey;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Listing writes — server-authored re-review notes and duplicate flags")
class ListingNoticesTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    ListingDuplicateProbe probe;
    @Autowired
    com.draazy.api.common.access.BackOfficeGrantRepository grants;
    @Autowired
    TestPlanGrants plans;

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User owner(String mobile) {
        return user(mobile, Roles.Wire.OWNER);
    }

    private User staff(String mobile) {
        return user(mobile, Roles.Wire.STAFF);
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("User " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private String body(String token, String meter, String address) {
        User photoOwner = users.findById(jwtService.parse(token.replace("Bearer ", "")).userId()).orElseThrow();
        return """
                {"title":"2BHK in Kothrud","deal":"rent","propertyType":"apartment","price":%d,
                 "bhk":2,"locality":"Kothrud","city":"Pune","floor":4,%s
                 %s %s}
                """.formatted(
                NEXT_PRICE.incrementAndGet(),
                listingImages(photoOwner),
                meter == null ? "" : ",\"electricityMeterNo\":\"" + meter + "\"",
                address == null ? "" : ",\"address\":\"" + address + "\"");
    }

    private UUID create(String token, String meter, String address) throws Exception {
        String json = mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(body(token, meter, address)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(json, "$.id"));
    }

    private static final java.util.concurrent.atomic.AtomicInteger NEXT_PRICE = new java.util.concurrent.atomic.AtomicInteger(32000);
    private static final String BASE = "ffff0000ffff0000";
    private static final String NEAR = "ffff0000ffff0003";
    private static final String BANDED_BUT_DISTANT = "ffff0000ffffffff";

    private static String photoUrl(User owner, String hash) {
        return "/api/dev/storage/public/photos/" + owner.getId() + "/" + UUID.randomUUID() + "-" + hash;
    }

    private static String imagesJson(User owner, String... hashes) {
        return Arrays.stream(hashes).map(h -> '"' + photoUrl(owner, h) + '"')
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static String photoBody(User owner, String... hashes) {
        return """
                {"title":"2BHK in Kothrud","deal":"rent","propertyType":"apartment","price":%d,
                 "bhk":2,"locality":"Kothrud","city":"Pune","floor":4,
                 "images":[%s]}
                """.formatted(NEXT_PRICE.incrementAndGet(), imagesJson(owner, hashes));
    }

    private UUID createWithPhotos(String token, String... hashes) throws Exception {
        User photoOwner = users.findById(jwtService.parse(token.replace("Bearer ", "")).userId()).orElseThrow();
        String json = mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(photoBody(photoOwner, hashes)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(json, "$.id"));
    }

    @Test
    @DisplayName("a stays-live edit posts an ops-attributed note naming the fields re-checked")
    void aRecheckExplainsItselfInTheThread() throws Exception {
        User owner = owner("9820000530");
        String token = bearer(owner);
        UUID id = create(token, null, null);
        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"price\":34000}"))
                .andExpect(status().isOk())

                .andExpect(jsonPath("$.status").value(PropertyStatus.APPROVED))
                .andExpect(jsonPath("$.recheckPending").value(true));

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].from").value("ops"))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString("You updated: price")))
                .andExpect(jsonPath("$.messages[0].read").value(false));
    }

    @Test
    @DisplayName("re-editing a field already under re-check does not write a second note")
    void aRepeatEditOnTheSameFieldDoesNotReopenTheThread() throws Exception {
        User owner = owner("9820000531");
        String token = bearer(owner);
        UUID id = create(token, null, null);
        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            p.setFurnishing(Furnishing.UNFURNISHED);
            properties.saveAndFlush(p);
        });

        patchOk(id, token, "{\"price\":34000}");
        patchOk(id, token, "{\"price\":34001}");
        patchOk(id, token, "{\"price\":34002}");

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("You updated: price")));

        patchOk(id, token, "{\"furnishing\":\"furnished\"}");

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[1].body").value(containsString("You updated: furnishing")));

        assertThat(properties.findById(id).orElseThrow().getRecheckReason())
                .isEqualTo("price, furnishing");
    }

    private void patchOk(UUID id, String token, String body) throws Exception {
        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an identity edit reverts to pending and says so, in one note not two")
    void aRemoderationExplainsItselfAndDoesNotAlsoRaiseARecheck() throws Exception {
        User owner = owner("9820000531");
        String token = bearer(owner);
        UUID id = create(token, null, null);
        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bhk\":3,\"price\":34000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PropertyStatus.PENDING));

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].from").value("ops"))
                .andExpect(jsonPath("$.messages[0].read").value(false))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString("off search")));
    }

    @Test
    @DisplayName("an edit that changes nothing material says nothing")
    void anOrdinaryEditDoesNotOpenACaseFile() throws Exception {
        User owner = owner("9820000532");
        String token = bearer(owner);
        UUID id = create(token, null, null);

        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deposit\":60000}"))
                .andExpect(status().isOk());

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());

        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"price\":41000}"))
                .andExpect(status().isOk());
        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1));
    }

    @Test
    @DisplayName("a pending listing is not told it stays live")
    void aPendingListingIsNotToldItStaysLive() throws Exception {
        User owner = owner("9820000552");
        String token = bearer(owner);

        UUID id = create(token, null, null);

        mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"price\":41000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PropertyStatus.PENDING))

                .andExpect(jsonPath("$.recheckPending").value(false));

        mvc.perform(get("/properties/" + id + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a matching meter number opens a staff-only case, and the listing still submits")
    void aDuplicateMeterFlagsForOpsWithoutRefusingTheListing() throws Exception {
        String firstToken = bearer(owner("9820000533"));
        UUID first = create(firstToken, "MSEDCL-170045321", null);
        Property firstListing = properties.findById(first).orElseThrow();

        String firstRef = firstListing.getSlug() == null
                ? first.toString() : firstListing.getSlug();

        String secondToken = bearer(owner("9820000534"));
        UUID second = create(secondToken, "MSEDCL-170045321", null);

        assertThat(properties.findById(second)).get()
                .extracting(Property::getStatus).isEqualTo(PropertyStatus.PENDING);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isNotFound());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115533"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].from").value("ops"))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString("Possible duplicate")))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString(firstRef)));
    }

    @Test
    @DisplayName("a paused duplicate still flags for ops")
    void aPausedDuplicateStillFlagsForOps() throws Exception {
        UUID first = create(bearer(owner("9820000544")), "MSEDCL-170045399", null);
        properties.findById(first).ifPresent(p -> {
            p.setStatus(PropertyStatus.PAUSED);
            properties.saveAndFlush(p);
        });

        UUID second = create(bearer(owner("9820000545")), "MSEDCL-170045399", null);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115545"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("Possible duplicate")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(first.toString())));
    }

    @Test
    @DisplayName("the write routes answer a flagged owner exactly as they answer an unflagged one")
    void theOracleIsClosedOnEveryRouteAndNotJustTheReadOne() throws Exception {
        create(bearer(owner("9820000540")), "MSEDCL-170046200", null);

        String flaggedToken = bearer(owner("9820000541"));
        UUID flagged = create(flaggedToken, "MSEDCL-170046200", null);

        String cleanToken = bearer(owner("9820000542"));
        UUID clean = create(cleanToken, "MSEDCL-170046201", null);

        for (UUID id : new UUID[] {flagged, clean}) {
            String token = id.equals(flagged) ? flaggedToken : cleanToken;
            mvc.perform(post("/properties/" + id + "/verification/read")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(status().isNoContent());
            mvc.perform(post("/properties/" + id + "/verification/messages")
                            .header(HttpHeaders.AUTHORIZATION, token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"body\":\"is something wrong with my listing?\"}"))
                    .andExpect(status().isCreated())

                    .andExpect(jsonPath("$.messages.length()").value(1))
                    .andExpect(jsonPath("$.messages[0].from").value("owner"));
        }
    }

    @Test
    @DisplayName("a staff-only case is absent from the owner's own queue entirely")
    void aStaffOnlyCaseIsAbsentFromTheOwnersQueue() throws Exception {
        create(bearer(owner("9820000538")), "MSEDCL-170046100", null);

        String secondToken = bearer(owner("9820000539"));
        create(secondToken, "MSEDCL-170046100", null);

        mvc.perform(get("/me/property-reviews").header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    @DisplayName("once the case has something for the owner, they see that and only that")
    void theOwnerReadsPastAnInternalNoteWithoutSeeingIt() throws Exception {
        create(bearer(owner("9820000542")), "MSEDCL-170046200", null);

        String secondToken = bearer(owner("9820000543"));
        UUID second = create(secondToken, "MSEDCL-170046200", null);

        properties.findById(second).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        mvc.perform(patch("/me/listings/" + second).header(HttpHeaders.AUTHORIZATION, secondToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"price\":45000}"))
                .andExpect(status().isOk());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString("You updated: price")));

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115543"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].body").value(
                        org.hamcrest.Matchers.containsString("Possible duplicate")));

        mvc.perform(get("/me/property-reviews").header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].unread").value(1));
    }

    @Test
    @DisplayName("the same address by two owners collides even when the meters differ")
    void theAddressArmOfTheProbeFires() throws Exception {
        create(bearer(owner("9820000540")), "MSEDCL-170047001", "Flat 402, B Wing, Rohan Nilay");

        String secondToken = bearer(owner("9820000541"));
        UUID second = create(secondToken, "MSEDCL-170047002", "B-402 Rohan Nilay");

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115540"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("Possible duplicate")));
    }

    @Test
    @DisplayName("reused photographs collide across owners, and the submitter is never told")
    void thePhotoArmOfTheProbeFires() throws Exception {
        UUID first = createWithPhotos(bearer(owner("9820000570")), BASE);

        String secondToken = bearer(owner("9820000571"));
        UUID second = createWithPhotos(secondToken, NEAR);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115570"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(first.toString())))
                .andExpect(jsonPath("$.messages[0].internal").value(true));

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isNotFound());

        mvc.perform(get("/properties/" + first + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115571"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a photograph that only shares an index band is not a duplicate")
    void theHammingCheckRejectsAChanceBandCollision() throws Exception {
        UUID first = createWithPhotos(bearer(owner("9820000562")), BASE);

        UUID distant = createWithPhotos(bearer(owner("9820000563")), BANDED_BUT_DISTANT);

        mvc.perform(get("/properties/" + distant + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115562"))))
                .andExpect(status().isNotFound());

        UUID near = createWithPhotos(bearer(owner("9820000567")), NEAR);
        mvc.perform(get("/properties/" + near + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115567"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(first.toString())));
    }

    @Test
    @DisplayName("your own photographs on your own second listing are not a duplicate")
    void thePhotoArmSkipsTheSameOwner() throws Exception {
        User both = owner("9820000564");

        plans.grant(both.getId(), TestPlanGrants.OWNER_PLUS);
        String token = bearer(both);

        UUID first = createWithPhotos(token, BASE);
        UUID second = createWithPhotos(token, BASE);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115564"))))
                .andExpect(status().isNotFound());

        UUID stranger = createWithPhotos(bearer(owner("9820000568")), BASE);
        mvc.perform(get("/properties/" + stranger + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115568"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(first.toString())));
    }

    @Test
    @DisplayName("swapping in somebody else's photographs on an edit raises the flag")
    void changingPhotographsReprobes() throws Exception {
        UUID first = createWithPhotos(bearer(owner("9820000565")), BASE);

        User secondOwner = owner("9820000566");
        String secondToken = bearer(secondOwner);
        UUID second = createWithPhotos(secondToken, BANDED_BUT_DISTANT);

        mvc.perform(patch("/me/listings/" + second).header(HttpHeaders.AUTHORIZATION, secondToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"images\":[" + imagesJson(secondOwner, NEAR) + "]}"))
                .andExpect(status().isOk());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115565"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(first.toString())));
    }

    @Test
    @DisplayName("a hash the client sends is ignored — only the server's, carried in the upload key, counts")
    void aClientClaimedHashIsIgnored() throws Exception {
        createWithPhotos(bearer(owner("9820000591")), BASE);

        User claimant = owner("9820000592");
        String json = mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"2BHK in Kothrud","deal":"rent","propertyType":"apartment","price":32000,
                                 "bhk":2,"locality":"Kothrud","city":"Pune","floor":4,
                                 "images":["%s"],"photoHashes":["%s"]}
                                """.formatted(listingPhoto(claimant), BASE)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID claimed = UUID.fromString(com.jayway.jsonpath.JsonPath.read(json, "$.id"));

        mvc.perform(get("/properties/" + claimed + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115591"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the catch-up sweep reaches a listing whose only signal is its photographs")
    void theSweepReadsPhotoOnlyListings() throws Exception {
        UUID first = createWithPhotos(bearer(owner("9820000572")), BASE);
        UUID second = createWithPhotos(bearer(owner("9820000573")), NEAR);

        String staffToken = bearer(staff("9871115572"));

        mvc.perform(get("/properties/" + first + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isNotFound());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")));

        probe.resweepRecent(Instant.now().minus(Duration.ofMinutes(20)), 500);

        mvc.perform(get("/properties/" + first + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("reuses photographs")))
                .andExpect(jsonPath("$.messages[0].body").value(containsString(second.toString())));
    }

    @Test
    @DisplayName("an owner's read receipt cannot mark the note it never showed them")
    void aReadReceiptSkipsTheNotesTheOwnerCannotSee() throws Exception {
        create(bearer(owner("9820000544")), "MSEDCL-170046201", null);

        String secondToken = bearer(owner("9820000545"));
        UUID second = create(secondToken, "MSEDCL-170046201", null);
        properties.findById(second).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        patchOk(second, secondToken, "{\"price\":45000}");

        mvc.perform(post("/properties/" + second + "/verification/read")
                        .header(HttpHeaders.AUTHORIZATION, secondToken))
                .andExpect(status().isNoContent());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115545"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].internal").value(true))
                .andExpect(jsonPath("$.messages[0].read").value(false))
                .andExpect(jsonPath("$.messages[1].internal").value(false))
                .andExpect(jsonPath("$.messages[1].read").value(true));
    }

    @Test
    @DisplayName("the meter number and the flat number are the owner's to see and nobody else's")
    void theMeterNumberNeverReachesThePublicResponse() throws Exception {
        User owner = owner("9820000542");
        String token = bearer(owner);
        UUID id = create(token, "MSEDCL-170048777", "A-902, Rohan Nilay, Baner");
        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            properties.saveAndFlush(p);
        });

        mvc.perform(get("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricityMeterNo").value("MSEDCL-170048777"))
                .andExpect(jsonPath("$.address").value("A-902, Rohan Nilay, Baner"));

        mvc.perform(get("/properties/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricityMeterNo").doesNotExist())
                .andExpect(jsonPath("$.address").doesNotExist());
        mvc.perform(get("/properties/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner("9820000543"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricityMeterNo").doesNotExist())
                .andExpect(jsonPath("$.address").doesNotExist());
    }

    @Test
    @DisplayName("the flag reason reaches only the desk, never the public or the listing owner")
    void theFlagReasonReachesOnlyStaff() throws Exception {
        User owner = owner("9820000549");
        String token = bearer(owner);
        UUID id = create(token, null, null);
        properties.findById(id).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            p.setFlagReason("reporter says the photos are from a hotel listing");
            properties.saveAndFlush(p);
        });

        mvc.perform(get("/properties/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason").doesNotExist());

        mvc.perform(get("/properties/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner("9820000550"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason").doesNotExist());

        mvc.perform(get("/properties/" + id).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason").doesNotExist());

        mvc.perform(get("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason").doesNotExist());

        mvc.perform(get("/properties/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115570"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason")
                        .value("reporter says the photos are from a hotel listing"));

        mvc.perform(get("/admin/properties/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115571"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flagReason")
                        .value("reporter says the photos are from a hotel listing"));
    }

    @Test
    @DisplayName("the duplicate note says which listing is the doubtful one, not just that two exist")
    void theNoteCarriesEnoughToActOn() throws Exception {
        String firstToken = bearer(owner("9820000544"));
        UUID first = create(firstToken, "MSEDCL-170049100", null);

        properties.findById(first).ifPresent(p -> {
            p.setStatus(PropertyStatus.APPROVED);
            p.setOwnerVerified(true);
            properties.saveAndFlush(p);
        });

        UUID second = create(bearer(owner("9820000545")), "MSEDCL-170049100", null);

        String body = mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115544"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        String note = com.jayway.jsonpath.JsonPath.read(body, "$.messages[0].body");

        assertThat(note)
                .contains(PropertyStatus.APPROVED)
                .contains("owner verified")
                .contains(PropertyStatus.PENDING)
                .contains("owner unverified")
                .contains("listed ");
    }

    @Test
    @DisplayName("a case a moderator has been denied properties:read is not a case they can read")
    void aStaffAccountWithoutTheGrantIsNotAChecker() throws Exception {
        create(bearer(owner("9820000546")), "MSEDCL-170049200", null);
        UUID second = create(bearer(owner("9820000547")), "MSEDCL-170049200", null);

        User narrowed = staff("9871115546");
        grants.saveAndFlush(new com.draazy.api.common.access.BackOfficeGrant(
                narrowed.getId(), "[\"users:read\"]", narrowed.getId()));

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(narrowed)))
                .andExpect(status().isNotFound());

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115547"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1));
    }

    @Test
    @DisplayName("a flag on an old case file lifts it back up the ops queue instead of sinking")
    void anInternalNoteResurfacesTheCase() throws Exception {
        create(bearer(owner("9820000548")), "MSEDCL-170049300", null);

        String ownerToken = bearer(owner("9820000549"));
        UUID stale = create(ownerToken, null, null);
        mvc.perform(post("/properties/" + stale + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, ownerToken))
                .andExpect(status().isCreated());

        String otherToken = bearer(owner("9820000550"));
        UUID newer = create(otherToken, null, null);
        mvc.perform(post("/properties/" + newer + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isCreated());

        String latest = """
                select property_id::text from property_reviews where property_id in (?, ?)
                order by last_message_at desc, id desc limit 1
                """;
        properties.flush();
        assertThat(jdbc.queryForObject(latest, String.class, stale, newer)).isEqualTo(newer.toString());

        mvc.perform(patch("/me/listings/" + stale).header(HttpHeaders.AUTHORIZATION, ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"electricityMeterNo\":\"MSEDCL-170049300\"}"))
                .andExpect(status().isOk());

        properties.flush();
        assertThat(jdbc.queryForObject(latest, String.class, stale, newer)).isEqualTo(stale.toString());
    }

    @Test
    @DisplayName("a society that does not exist is not a society this listing can join")
    void anUnknownSocietyIsRefused() throws Exception {
        User o = owner("9820000551");
        String token = bearer(o);

        mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"2BHK in Kothrud","deal":"rent","propertyType":"apartment",
                                 "price":32000,"bhk":2,"locality":"Kothrud","city":"Pune",
                                 "societyId":"00000000-0000-4000-8000-00000000dead",%s}
                                """.formatted(listingImages(o))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the same owner listing the same meter twice is housekeeping, not fraud")
    void oneOwnerDoesNotCollideWithThemselves() throws Exception {
        User owner = owner("9820000535");

        plans.grant(owner.getId(), TestPlanGrants.OWNER_PLUS);
        String token = bearer(owner);
        create(token, "MSEDCL-170045999", null);
        UUID second = create(token, "MSEDCL-170045999", null);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115535"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a listing with no meter number does not collide with every other listing that has none")
    void absentSignalsMatchNothing() throws Exception {
        create(bearer(owner("9820000536")), null, null);

        UUID second = create(bearer(owner("9820000537")), null, null);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115537"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("two spellings of one address normalise to the same key")
    void theAddressNormaliserCollapsesTheSpellingsThatActuallyOccur() {
        String a = AddressKey.of("Flat 402, B Wing, Rohan Nilay, Baner", "Pune", "Baner");
        String b = AddressKey.of("B-402 Rohan Nilay, Baner, Pune 411045", "Pune", "Baner");
        assertThat(a).isEqualTo(b).isEqualTo("402 b nilay rohan");

        assertThat(AddressKey.of("Flat 403, B Wing, Rohan Nilay, Baner", "Pune", "Baner"))
                .isNotEqualTo(a);

        assertThat(AddressKey.of("The society building", "Pune", "Baner")).isNull();
        assertThat(AddressKey.of(null, "Pune", "Baner")).isNull();

        assertThat(AddressKey.of("Flat 402", "Pune", "Baner")).isNull();
    }

    @Test
    @DisplayName("the catch-up sweep flags the pair that submitted in the same second (D219)")
    void theSweepCatchesTheCollisionNeitherWriterCouldSee() throws Exception {
        String firstToken = bearer(owner("9820000560"));
        UUID first = create(firstToken, "MSEDCL-170047100", null);

        String secondToken = bearer(owner("9820000561"));
        UUID second = create(secondToken, null, null);
        Property racer = properties.findById(second).orElseThrow();
        racer.setElectricityMeterNo("MSEDCL-170047100");
        racer.setElectricityMeterKey(MeterKey.of("MSEDCL-170047100"));
        properties.saveAndFlush(racer);

        String staffToken = bearer(staff("9871115560"));

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isNotFound());

        probe.resweepRecent(Instant.now().minus(Duration.ofMinutes(20)), 500);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].from").value("ops"))
                .andExpect(jsonPath("$.messages[0].body").value(containsString("Possible duplicate")));
        mvc.perform(get("/properties/" + first + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].body").value(containsString("Possible duplicate")));

        probe.resweepRecent(Instant.now().minus(Duration.ofMinutes(20)), 500);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(jsonPath("$.messages.length()").value(1));
    }

    @Test
    @DisplayName("the sweep does not reach back past its window")
    void theSweepLooksOnlyAtWhatWasJustWritten() throws Exception {
        create(bearer(owner("9820000562")), "MSEDCL-170047200", null);

        String secondToken = bearer(owner("9820000563"));
        UUID second = create(secondToken, null, null);
        Property racer = properties.findById(second).orElseThrow();
        racer.setElectricityMeterNo("MSEDCL-170047200");
        properties.saveAndFlush(racer);

        probe.resweepRecent(Instant.now().plus(Duration.ofMinutes(1)), 500);

        mvc.perform(get("/properties/" + second + "/verification")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff("9871115563"))))
                .andExpect(status().isNotFound());
    }
}
