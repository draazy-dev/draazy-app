package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

@DisplayName("D239 — the concierge desk could only ever record one listing per owner")
class ConciergeListingQuotaTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;

    @AfterAll
    static void removeRowsThatEscapedRollback() {
        cleanup.update("delete from audit_log where action like '%_on_behalf'");
        cleanup.update("delete from users where mobile like '98539000%'");
    }

    private static JdbcTemplate cleanup;

    @BeforeEach
    void lendTemplateToTheStaticTeardown() {
        cleanup = jdbc;
    }

    private static final String ON_BEHALF = """
            {"ownerMobile":"%s","ownerName":"Phoned In",
             "listing":{"title":"%s","deal":"rent","propertyType":"apartment","price":25000,"deposit":50000,
                        "locality":"Kothrud","city":"Pune"}}
            """;
    private static final String ON_BEHALF_WITH_IMAGES = """
            {"ownerMobile":"%s","ownerName":"Phoned In",
             "listing":{"title":"%s","deal":"rent","propertyType":"apartment","price":25000,"deposit":50000,
                        "locality":"Kothrud","city":"Pune","images":["%s"]}}
            """;

    // Desk-created accounts commit outside the test rollback, so this class must clean them up.
    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Concierge " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property held(User owner, String title, String status) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(status);
        p.setLocalitySlug("kothrud");
        return properties.saveAndFlush(p);
    }

    private int postOnBehalf(User staff, String ownerMobile, String title) throws Exception {
        return mvc.perform(post("/admin/properties")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ON_BEHALF.formatted(ownerMobile, title)))
                .andReturn().getResponse().getStatus();
    }

    private int postOnBehalf(User staff, String ownerMobile, String title, String image) throws Exception {
        return mvc.perform(post("/admin/properties")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ON_BEHALF_WITH_IMAGES.formatted(ownerMobile, title, image)))
                .andReturn().getResponse().getStatus();
    }

    private static String upload(User owner) {
        return "/api/dev/storage/public/photos/" + owner.getId() + "/" + UUID.randomUUID();
    }

    @Test
    @DisplayName("the desk cannot create an owner whose name self-service would refuse")
    void onBehalfRefusesAnInvalidOwnerName() throws Exception {
        User staff = user("9853900029", "staff");

        mvc.perform(post("/admin/properties")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ON_BEHALF.formatted("9853900030", "Bad name").replace("Phoned In", "Phoned 123")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("name"));
        assertThat(users.findByMobile("9853900030")).isEmpty();
    }

    @Test
    @DisplayName("the desk can record a listing before photos exist")
    void onBehalfCreateWithoutPhotosStillSucceeds() throws Exception {
        User staff = user("9853900031", "staff");

        assertThat(postOnBehalf(staff, "9853900032", "No photos yet")).isEqualTo(201);
    }

    @Test
    @DisplayName("the desk can attach photos uploaded by the staff actor")
    void onBehalfCreateWithStaffUploadedPhotoSucceeds() throws Exception {
        User staff = user("9853900033", "staff");

        assertThat(postOnBehalf(staff, "9853900034", "Staff photo", upload(staff))).isEqualTo(201);
    }

    @Test
    @DisplayName("the desk can record a second listing for an owner whose own wizard would refuse")
    void theDeskIsNotBoundByTheOwnersPlan() throws Exception {
        User staff = user("9853900001", "staff");
        User owner = user("9853900002", "owner");
        held(owner, "The flat they already listed", PropertyStatus.APPROVED);

        assertThat(postOnBehalf(staff, owner.getMobile(), "The second flat they phoned in"))
                .isEqualTo(201);
    }

    @Test
    @DisplayName("a brand-new owner does not run out after one, which is every first call")
    void aProvisionedOwnerIsNotCappedAtOne() throws Exception {
        User staff = user("9853900003", "staff");

        assertThat(postOnBehalf(staff, "9853900004", "Their first flat")).isEqualTo(201);
        assertThat(postOnBehalf(staff, "9853900004", "Their second flat")).isEqualTo(201);
        assertThat(postOnBehalf(staff, "9853900004", "Their third flat")).isEqualTo(201);
    }

    @Test
    @DisplayName("the standing read names both numbers, and says when one is past the other")
    void standingReportsTheOverage() throws Exception {
        User staff = user("9853900007", "staff");
        User owner = user("9853900008", "owner");
        held(owner, "One", PropertyStatus.APPROVED);
        held(owner, "Two", PropertyStatus.FLAGGED);
        held(owner, "Three", PropertyStatus.PENDING);

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", owner.getMobile())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.known").value(true))
                .andExpect(jsonPath("$.allowance").value(1))
                .andExpect(jsonPath("$.held").value(2))
                .andExpect(jsonPath("$.pending").value(1))
                .andExpect(jsonPath("$.overAllowance").value(true));
    }

    @Test
    @DisplayName("at the ceiling is not over it")
    void standingDoesNotCryWolfAtExactlyTheLimit() throws Exception {
        User staff = user("9853900009", "staff");
        User owner = user("9853900010", "owner");
        held(owner, "Their only one", PropertyStatus.APPROVED);

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", owner.getMobile())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.held").value(1))
                .andExpect(jsonPath("$.overAllowance").value(false));
    }

    @Test
    @DisplayName("a number with no account answers 200, not 404")
    void anUnknownNumberIsNotAnError() throws Exception {
        User staff = user("9853900011", "staff");

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", "9853900012")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.known").value(false))
                .andExpect(jsonPath("$.held").value(0))
                .andExpect(jsonPath("$.pending").value(0))
                .andExpect(jsonPath("$.overAllowance").value(false));
    }

    @Test
    @DisplayName("the number is normalised the way an operator types it")
    void spacingAndPunctuationAreStripped() throws Exception {
        User staff = user("9853900013", "staff");
        User owner = user("9853900014", "owner");

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", "98539 00014")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mobile").value(owner.getMobile()))
                .andExpect(jsonPath("$.known").value(true));
    }

    @Test
    @DisplayName("a half-typed number is a 400, not a lookup for nobody")
    void anIncompleteNumberIsRefused() throws Exception {
        User staff = user("9853900015", "staff");

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", "98530")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a buyer cannot read anybody's standing")
    void standingIsStaffOnly() throws Exception {
        User buyer = user("9853900016", "buyer");

        mvc.perform(get("/admin/properties/owner-standing")
                        .param("mobile", "9853900017")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a rent listing keyed in by the desk needs a deposit, though 0 is fine")
    void aRentListingNeedsADeposit() throws Exception {
        User staff = user("9853900041", "staff");
        String noDeposit = ON_BEHALF.replace("\"deposit\":50000,", "");

        mvc.perform(post("/admin/properties")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(noDeposit.formatted("9853900042", "No deposit")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("listing.deposit is required for a rent listing."));
        mvc.perform(post("/admin/properties")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(noDeposit.replace("\"price\":25000,", "\"price\":25000,\"deposit\":0,")
                                .formatted("9853900042", "Zero deposit")))
                .andExpect(status().isCreated());
    }}
