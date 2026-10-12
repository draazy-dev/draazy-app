package com.draazy.api.finance.tenancy;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.AvailableOn;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.ReviewerStanding;
import com.draazy.api.common.web.Routes;
import com.draazy.api.deals.visit.PropertyExperienceService;
import com.draazy.api.engagement.notification.NotificationRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.JwtService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

// Contract + behaviour proof for the tenancy lifecycle and tenant screening profile. The load-bearing tests
// here are the ones that would let somebody read a stranger's income.
class TenancyEndpointsTest extends AbstractApiTest {

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired JwtService jwtService;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TenancyRepository tenancies;
    @Autowired PropertyExperienceService experience;
    @Autowired NotificationRepository notifications;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping handlerMapping;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Tenancy User " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property rentListing(User owner) {
        Property p = new Property(owner, "Let listing", "rent", "apartment", 28000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("950"));
        return properties.saveAndFlush(p);
    }

    private Property saleListing(User owner) {
        Property p = new Property(owner, "Sale listing", "buy", "apartment", 9500000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("3"));
        p.setStatus("approved");
        p.setPriceUnit("total");
        p.setArea(new BigDecimal("1400"));
        return properties.saveAndFlush(p);
    }

    private void closeDeal(User owner, Property p, String counterpartyMobile, long price)
            throws Exception {
        mvc.perform(post("/me/deals/" + p.getId() + "/close")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"agreedPrice\":" + price + ",\"counterpartyMobile\":\""
                                + counterpartyMobile + "\"}"))
                .andExpect(status().isOk());
    }

    // There is no user row to point `tenant_id` at, so the deal closes without a tenancy rather than the platform
    // inventing a shadow user.
    @Test
    void closingARentDeal_proposesAPendingTenancyForARegisteredTenant() throws Exception {
        User owner = user("9822200001", "owner");
        User tenant = user("9822200002", "buyer");
        Property p = rentListing(owner);

        closeDeal(owner, p, tenant.getMobile(), 28000L);

        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        assertThat(tenancies.findPendingByPropertyId(p.getId())).isPresent();

        mvc.perform(get(Routes.Tenancies.MINE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].propertyId").value(p.getId().toString()))
                .andExpect(jsonPath("$[0].rent").value(28000))
                .andExpect(jsonPath("$[0].status").value(TenancyStatuses.PENDING))
                .andExpect(jsonPath("$[0].startDate").doesNotExist())
                .andExpect(jsonPath("$[0].owner.mobile").value(org.hamcrest.Matchers.not(owner.getMobile())));

        mvc.perform(get(Routes.Tenancies.MINE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user("9822200011", "buyer"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ---- 4: the tenant profile round-trips, and the score is server-computed ----
    @Test
    void closingARentDeal_offPlatformTenant_opensNoTenancyButStillCloses() throws Exception {
        User owner = user("9822200003", "owner");
        Property p = rentListing(owner);

        closeDeal(owner, p, "9876500001", 22000L);

        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        mvc.perform(get("/me/deals/" + p.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.status").value("closed"));
    }

    @Test
    void closingABuyDeal_opensNoTenancy() throws Exception {
        User owner = user("9822200004", "owner");
        User buyer = user("9822200005", "buyer");
        Property p = saleListing(owner);

        closeDeal(owner, p, buyer.getMobile(), 9500000L);

        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
    }

    @Test
    void reopeningARentDeal_endsTheTenancyAndFreesTheProperty() throws Exception {
        User owner = user("9822200006", "owner");
        User tenant = user("9822200007", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        confirm(tenant, pendingId(p));

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk());

        em.clear();
        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        assertThat(tenancies.findByPropertyId(p.getId()))
                .singleElement()
                .satisfies(t -> {
                    assertThat(t.getStatus()).isEqualTo(TenancyStatuses.ENDED);
                    assertThat(t.getEndDate()).isNotNull();
                });

        p = properties.findById(p.getId()).orElseThrow();
        p.setStatus("approved");
        properties.saveAndFlush(p);
        User next = user("9822200008", "buyer");
        closeDeal(owner, p, next.getMobile(), 30000L);
        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        assertThat(tenancies.findPendingByPropertyId(p.getId())).isPresent();
    }

    @Test
    void reopeningARentDeal_withAFutureDate_endsTheTenancyTheDayBeforeAndSetsTheDate() throws Exception {
        User owner = user("9822200041", "owner");
        User tenant = user("9822200042", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        confirm(tenant, pendingId(p));
        LocalDate on = AvailableOn.today().plusDays(20);

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"availableOn\":\"" + on + "\"}"))
                .andExpect(status().isOk());

        em.clear();
        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        assertThat(tenancies.findByPropertyId(p.getId())).singleElement().satisfies(t -> {
            assertThat(t.getStatus()).isEqualTo(TenancyStatuses.ENDED);
            assertThat(t.getEndDate()).isEqualTo(on.minusDays(1));
        });
        assertThat(properties.findById(p.getId()).orElseThrow().getAvailableOn()).isEqualTo(on);
    }

    @Test
    void reopeningARentDeal_withATodayDate_endsTheTenancyToday() throws Exception {
        User owner = user("9822200043", "owner");
        User tenant = user("9822200044", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        confirm(tenant, pendingId(p));

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"availableOn\":\"" + AvailableOn.today() + "\"}"))
                .andExpect(status().isOk());

        em.clear();
        assertThat(tenancies.findByPropertyId(p.getId())).singleElement()
                .satisfies(t -> assertThat(t.getEndDate()).isEqualTo(AvailableOn.today()));
    }

    @Test
    void reopeningADeal_withAPastDate_isRefused() throws Exception {
        User owner = user("9822200045", "owner");
        User tenant = user("9822200046", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"availableOn\":\"" + AvailableOn.today().minusDays(1) + "\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void reopeningARentDeal_beyondAYear_isRefused() throws Exception {
        User owner = user("9822200047", "owner");
        User tenant = user("9822200048", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"availableOn\":\"" + AvailableOn.today().plusDays(366) + "\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void reopeningARentDeal_withdrawsAnUnansweredTenancy() throws Exception {
        User owner = user("9822200021", "owner");
        User tenant = user("9822200022", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);

        mvc.perform(post("/me/deals/" + p.getId() + "/reopen")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk());

        em.clear();
        assertThat(tenancies.findByPropertyId(p.getId()))
                .singleElement()
                .satisfies(t -> assertThat(t.getStatus()).isEqualTo(TenancyStatuses.DECLINED));
        mvc.perform(get(Routes.Tenancies.MINE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void closingARentDeal_notifiesTheNamedTenant() throws Exception {
        User owner = user("9822200023", "owner");
        User tenant = user("9822200024", "buyer");
        Property p = rentListing(owner);

        closeDeal(owner, p, tenant.getMobile(), 28000L);

        assertThat(notifications.findAll())
                .filteredOn(n -> n.getUserId().equals(tenant.getId()) && "tenancy.pending".equals(n.getType()))
                .hasSize(1);
    }

    @Test
    void closingARentDeal_onYourOwnNumber_opensNoTenancy() throws Exception {
        User owner = user("9822200025", "owner");
        Property p = rentListing(owner);

        closeDeal(owner, p, owner.getMobile(), 28000L);

        assertThat(tenancies.findByPropertyId(p.getId())).isEmpty();
    }

    @Test
    void theNamedTenantConfirms_andTheTenancyBecomesActive() throws Exception {
        User owner = user("9822200026", "owner");
        User tenant = user("9822200027", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        UUID id = pendingId(p);

        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", id.toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyStatuses.ACTIVE))
                .andExpect(jsonPath("$.startDate").exists())
                .andExpect(jsonPath("$.owner.mobile").value(owner.getMobile()));

        assertThat(tenancies.findActiveByPropertyId(p.getId())).isPresent();
        assertThat(tenancies.existsConfirmedByTenantIdAndOwnerId(tenant.getId(), owner.getId())).isTrue();
        assertThat(experience.standingOf(tenant.getId(), p.getId())).isEqualTo(ReviewerStanding.TENANT);

        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", id.toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isConflict());
    }

    @Test
    void anyoneButTheNamedTenant_getsNotFound_andTheTenancyStaysPending() throws Exception {
        User owner = user("9822200028", "owner");
        User tenant = user("9822200029", "buyer");
        User stranger = user("9822200030", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        String url = Routes.Tenancies.CONFIRM.replace("{id}", pendingId(p).toString());

        for (User caller : new User[] {stranger, owner}) {
            mvc.perform(post(url).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isNotFound());
            mvc.perform(post(url.replace("confirm", "decline")).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", "not-a-uuid"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isNotFound());
        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", UUID.randomUUID().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isNotFound());
        mvc.perform(post(url)).andExpect(status().isUnauthorized());

        assertThat(tenancies.findPendingByPropertyId(p.getId())).isPresent();
    }

    @Test
    void aTenantWithoutAVerifiedMobile_getsNotFound() throws Exception {
        User owner = user("9822200031", "owner");
        User tenant = user("9822200032", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        String url = Routes.Tenancies.CONFIRM.replace("{id}", pendingId(p).toString());

        tenant.setMobileVerified(false);
        users.saveAndFlush(tenant);
        mvc.perform(post(url).header(HttpHeaders.AUTHORIZATION, bearer(tenant))).andExpect(status().isNotFound());

    }

    @Test
    void theNamedTenantDeclines_theDealStaysClosedAndTheTenancyIsNeverActive() throws Exception {
        User owner = user("9822200033", "owner");
        User tenant = user("9822200034", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);
        UUID id = pendingId(p);

        mvc.perform(post(Routes.Tenancies.DECLINE.replace("{id}", id.toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyStatuses.DECLINED));

        assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
        assertThat(tenancies.existsConfirmedByTenantIdAndOwnerId(tenant.getId(), owner.getId())).isFalse();
        mvc.perform(get("/me/deals/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.status").value("closed"));
        mvc.perform(get(Routes.Tenancies.MINE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", id.toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isConflict());
    }

    @Test
    void aPendingTenancy_givesNoReviewStandingAndNoContactAccess() throws Exception {
        User owner = user("9822200035", "owner");
        User tenant = user("9822200036", "buyer");
        Property p = rentListing(owner);
        closeDeal(owner, p, tenant.getMobile(), 28000L);

        assertThat(tenancies.existsByTenantIdAndPropertyId(tenant.getId(), p.getId())).isFalse();
        assertThat(tenancies.existsConfirmedByTenantIdAndOwnerId(tenant.getId(), owner.getId())).isFalse();
        assertThat(tenancies.existsBetween(tenant.getId(), owner.getId())).isFalse();
        assertThat(experience.standingOf(tenant.getId(), p.getId())).isEqualTo(ReviewerStanding.NONE);
    }

    private UUID pendingId(Property p) {
        return tenancies.findPendingByPropertyId(p.getId()).orElseThrow().getId();
    }

    private void confirm(User tenant, UUID id) throws Exception {
        mvc.perform(post(Routes.Tenancies.CONFIRM.replace("{id}", id.toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk());
    }
    @Test
    void tenancyListsRequireAuthentication() throws Exception {
        mvc.perform(get(Routes.Tenancies.MINE)).andExpect(status().isUnauthorized());
    }

    @Test
    void myProfile_emptyBeforeAnySave() throws Exception {
        User tenant = user("9822200012", "buyer");

        // "Never assessed" and "assessed, scored nothing" are different claims about a person, and the screening
        // meter renders them differently.
        mvc.perform(get(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.score").doesNotExist())
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    // The client must not be able to set its own score or verified badge.
    @Test
    void updateMyProfile_computesTheScoreFromTheStoredFields() throws Exception {
        User tenant = user("9822200013", "buyer");

        mvc.perform(put(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Asha K\",\"occupation\":\"Software Engineer\","
                                + "\"income\":95000,\"occupants\":\"family\","
                                + "\"priorLandlord\":\"Mr Kulkarni 9876500002\","
                                + "\"about\":\"Quiet family of three.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(70))
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.occupants").value(OccupantTypes.FAMILY))
                .andExpect(jsonPath("$.income").value(95000));
    }

    // PUT replaces: a field the tenant removed from the form must actually go.
    @Test
    void updateMyProfile_cannotSetItsOwnScoreOrVerifiedBadge() throws Exception {
        User tenant = user("9822200014", "buyer");

        mvc.perform(put(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Chancer\",\"score\":100,\"verified\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(0))
                .andExpect(jsonPath("$.verified").value(false));
    }

    // The three refusals must be indistinguishable.
    @Test
    void updateMyProfile_replacesRatherThanMerges() throws Exception {
        User tenant = user("9822200015", "buyer");
        mvc.perform(put(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Asha K\",\"about\":\"Some text\"}"))
                .andExpect(status().isOk());

        mvc.perform(put(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Asha K\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.about").doesNotExist());
    }

    // A screening owner reads the profile, not the number — the contact gate still applies.
    @Test
    void updateMyProfile_rejectsAnUnknownOccupantType() throws Exception {
        User tenant = user("9822200016", "buyer");

        mvc.perform(put(Routes.Tenancies.MY_PROFILE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"occupants\":\"students\"}"))
                .andExpect(status().isBadRequest());
    }

    // ---- 6: there is deliberately no create route (spec fix S9) ----
    @Test
    void thereIsNoWayForAClientToCreateATenancy() {
        Set<String> mapped = handlerMapping.getHandlerMethods().entrySet().stream()
                .filter(e -> e.getKey().getPathPatternsCondition() != null)
                .flatMap(e -> e.getKey().getPathPatternsCondition().getPatternValues().stream()
                        .map(path -> e.getKey().getMethodsCondition().getMethods().stream()
                                .map(Enum::name).collect(Collectors.joining(",")) + " " + path))
                .collect(Collectors.toSet());

        assertThat(mapped).doesNotContain("POST /tenancies");
    }
}
