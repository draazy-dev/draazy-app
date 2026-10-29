package com.draazy.api.leads.photos;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class PhotoRequestEndpointsTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    PhotoRequestRepository photoRequests;

    private static final String BUYER_MOBILE = "9000000001";

    private User user(String mobile, String role, String name) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String title, String slug) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setSlug(slug);
        return properties.saveAndFlush(p);
    }

    private Property listing(User owner, String title) {
        return listing(owner, title, "listing-" + UUID.randomUUID());
    }

    private String askUrl(Property p) {
        return Routes.PropertyPhotoRequests.BASE.replace("{id}", p.getId().toString());
    }

    private String decideUrl(PhotoRequest row) {
        return Routes.MePhotoRequests.BY_ID.replace("{reqId}", row.getId().toString());
    }

    private MockHttpServletRequestBuilder decide(String url, User actor, String decision) {
        return patch(url)
                .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"" + decision + "\"}");
    }

    @Test
    void askingTwice_returnsTheOriginalRow_andInsertsNothingTheSecondTime() throws Exception {
        User owner = user("9000000100", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud");

        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.request.status").value(PhotoRequestStatuses.PENDING));

        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(false));

        assertThat(photoRequests.findAll()).hasSize(1);
    }

    @Test
    void anOwnerAskingForPhotosOfTheirOwnListing_is400_andWritesNothing() throws Exception {
        User owner = user("9000000102", "owner", "Rohan Kulkarni");
        Property p = listing(owner, "2 BHK in Kothrud");

        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isBadRequest());

        assertThat(photoRequests.findAll()).isEmpty();
    }

    @Test
    void anAnonymousCaller_cannotAsk() throws Exception {
        User owner = user("9000000103", "owner", "Rohan Kulkarni");
        Property p = listing(owner, "2 BHK in Kothrud");

        mvc.perform(post(askUrl(p))).andExpect(status().isUnauthorized());

        assertThat(photoRequests.findAll()).isEmpty();
    }

    @Test
    void theOwnerSeesWhoAsked_butNeverTheirRealMobile() throws Exception {
        User owner = user("9000000104", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud", "2-bhk-kothrud-pune");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));

        mvc.perform(get(Routes.MePhotoRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())

                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].requester.name").value("Asha Patil"))
                .andExpect(jsonPath("$.content[0].propertyTitle").value("2 BHK in Kothrud"))
                .andExpect(jsonPath("$.content[0].propertySlug").value("2-bhk-kothrud-pune"))

                .andExpect(jsonPath("$.content[0].requester.mobile").value("90XXXXX001"));
    }

    @Test
    void anOwnerSeesOnlyRequestsAgainstTheirOwnListings() throws Exception {
        User rohan = user("9000000105", "owner", "Rohan Kulkarni");
        User meera = user("9000000106", "owner", "Meera Joshi");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        listing(rohan, "Rohan's 2 BHK");
        Property meeras = listing(meera, "Meera's 3 BHK");

        mvc.perform(post(askUrl(meeras)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.created").value(true));

        mvc.perform(get(Routes.MePhotoRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(rohan)))
                .andExpect(jsonPath("$.content.length()").value(0));

        mvc.perform(get(Routes.MePhotoRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(meera)))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].propertyTitle").value("Meera's 3 BHK"));
    }

    @Test
    void anOwnerWithNoListings_getsAnEmptyInbox() throws Exception {
        User owner = user("9000000107", "owner", "Rohan Kulkarni");
        User stranger = user("9000000108", "owner", "Meera Joshi");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(stranger, "Meera's 3 BHK");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.created").value(true));

        mvc.perform(get(Routes.MePhotoRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    @ParameterizedTest(name = "{0} gets 404 and leaves it pending")
    @ValueSource(strings = {"another owner", "the requester"})
    void resolvingARequestThatIsNotYours_is404_andLeavesItPending(String actor) throws Exception {
        User meera = user("9000000110", "owner", "Meera Joshi");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        User intruder = actor.equals("the requester")
                ? buyer
                : user("9000000111", "owner", "Rohan Kulkarni");
        Property meeras = listing(meera, "Meera's 3 BHK");
        mvc.perform(post(askUrl(meeras)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);
        String url = decideUrl(row);

        mvc.perform(decide(url, intruder, PhotoRequestStatuses.RESOLVED))
                .andExpect(status().isNotFound());
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getStatus())
                .isEqualTo(PhotoRequestStatuses.PENDING);
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getDecidedAt()).isNull();
        assertThat(notificationsFor(buyer)).isEmpty();

        mvc.perform(decide(url, meera, PhotoRequestStatuses.RESOLVED))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PhotoRequestStatuses.RESOLVED));
    }

    @ParameterizedTest(name = "{0} then {1} keeps the first decision")
    @CsvSource({"declined,resolved", "resolved,declined", "resolved,resolved", "declined,declined"})
    void aDecidedRequest_staysAsFirstDecided(String first, String second) throws Exception {
        User owner = user("9000000121", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);
        String url = decideUrl(row);
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getStatus())
                .isEqualTo(PhotoRequestStatuses.PENDING);

        mvc.perform(decide(url, owner, first)).andExpect(status().isOk());
        var decidedAt = photoRequests.findById(row.getId()).orElseThrow().getDecidedAt();
        assertThat(decidedAt).isNotNull();

        mvc.perform(decide(url, owner, second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(first));
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getDecidedAt())
                .isEqualTo(decidedAt);
    }

    @ParameterizedTest(name = "asking again after the owner {0} is still a duplicate")
    @ValueSource(strings = {PhotoRequestStatuses.RESOLVED, PhotoRequestStatuses.DECLINED})
    void askingAgainAfterTheOwnerDecided_isStillADuplicate(String decision) throws Exception {
        User owner = user("9000000122", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);
        mvc.perform(decide(decideUrl(row), owner, decision))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(decision));

        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(false))
                .andExpect(jsonPath("$.request.status").value(decision));

        assertThat(photoRequests.findAll()).hasSize(1);
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getStatus())
                .isEqualTo(decision);
    }

    @Test
    void anUnknownDecision_is400_andLeavesTheRowPending() throws Exception {
        User owner = user("9000000123", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);
        String url = decideUrl(row);

        mvc.perform(decide(url, owner, "approved")).andExpect(status().isBadRequest());
        mvc.perform(decide(url, owner, PhotoRequestStatuses.PENDING))
                .andExpect(status().isBadRequest());
        assertThat(photoRequests.findById(row.getId()).orElseThrow().getStatus())
                .isEqualTo(PhotoRequestStatuses.PENDING);
        assertThat(notificationsFor(buyer)).isEmpty();

        mvc.perform(decide(url, owner, PhotoRequestStatuses.DECLINED)).andExpect(status().isOk());
    }

    @Test
    void resolvingARequest_tellsTheBuyerPhotosArrived_andTellsTheOwnerNothingNew() throws Exception {
        User owner = user("9000000130", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud", "two-bhk-kothrud-resolved");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);

        mvc.perform(decide(decideUrl(row), owner, PhotoRequestStatuses.RESOLVED))
                .andExpect(status().isOk());

        List<Map<String, Object>> notes = notificationsFor(buyer);
        assertThat(notes).hasSize(1);
        assertThat(notes.getFirst().get("type")).isEqualTo("photo.added");
        assertThat(notes.getFirst().get("link")).isEqualTo("/property/two-bhk-kothrud-resolved");
        assertThat((String) notes.getFirst().get("body")).contains("2 BHK in Kothrud");
        assertThat(notificationsFor(owner)).extracting(note -> note.get("type"))
                .containsExactly("photo.requested");
    }

    @Test
    void decliningARequest_tellsTheBuyerNoMoreAreComing() throws Exception {
        User owner = user("9000000131", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud", "two-bhk-kothrud-declined");
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        PhotoRequest row = photoRequests.findAll().get(0);

        mvc.perform(decide(decideUrl(row), owner, PhotoRequestStatuses.DECLINED))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PhotoRequestStatuses.DECLINED))
                .andExpect(jsonPath("$.decidedAt").doesNotExist());

        List<Map<String, Object>> notes = notificationsFor(buyer);
        assertThat(notes).hasSize(1);
        assertThat(notes.getFirst().get("type")).isEqualTo("photo.declined");
        assertThat(notes.getFirst().get("link")).isEqualTo("/property/two-bhk-kothrud-declined");
        assertThat(notificationsFor(owner)).extracting(note -> note.get("type"))
                .containsExactly("photo.requested");
    }

    @Test
    void askingTwice_notifiesTheOwnerOnce() throws Exception {
        User owner = user("9000000132", "owner", "Rohan Kulkarni");
        User buyer = user(BUYER_MOBILE, "buyer", "Asha Patil");
        Property p = listing(owner, "2 BHK in Kothrud", "two-bhk-kothrud-asked");

        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));
        mvc.perform(post(askUrl(p)).header(HttpHeaders.AUTHORIZATION, bearer(buyer)));

        assertThat(notificationsFor(owner)).singleElement().satisfies(row -> {
            assertThat(row.get("type")).isEqualTo("photo.requested");
            assertThat(row.get("link")).isEqualTo("/dashboard?tab=leads&box=received");
            assertThat((String) row.get("body")).contains("2 BHK in Kothrud");
        });
        assertThat(notificationsFor(buyer)).isEmpty();
    }

    private List<Map<String, Object>> notificationsFor(User user) {
        return jdbc.queryForList(
                "select type, title, body, link from notifications where user_id = ?", user.getId());
    }
}
