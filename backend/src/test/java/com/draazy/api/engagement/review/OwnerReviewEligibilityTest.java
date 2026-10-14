package com.draazy.api.engagement.review;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.deals.deal.Deal;
import com.draazy.api.deals.deal.DealRepository;
import com.draazy.api.deals.deal.DealStatuses;
import com.draazy.api.deals.finalization.FinalizationRequest;
import com.draazy.api.deals.finalization.FinalizationRequestRepository;
import com.draazy.api.deals.finalization.FinalizationStatuses;
import com.draazy.api.deals.offer.Offer;
import com.draazy.api.deals.offer.OfferRepository;
import com.draazy.api.deals.offer.OfferStatuses;
import com.draazy.api.deals.visit.Visit;
import com.draazy.api.deals.visit.VisitRepository;
import com.draazy.api.deals.visit.VisitStatuses;
import com.draazy.api.finance.tenancy.Tenancy;
import com.draazy.api.finance.tenancy.TenancyRepository;
import com.draazy.api.finance.tenancy.TenancyStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.leads.contact.ContactRequestStatuses;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Engagement — owner reviews need a real relationship")
class OwnerReviewEligibilityTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ContactRequestRepository contactRequests;
    @Autowired VisitRepository visits;
    @Autowired TenancyRepository tenancies;
    @Autowired OfferRepository offers;
    @Autowired DealRepository deals;
    @Autowired FinalizationRequestRepository finalizations;

    @Test
    @DisplayName("an owner cannot review themselves")
    void selfReviewRefused() throws Exception {
        User owner = user("9821000001");

        review(owner, owner, 422).andExpect(jsonPath("$.error").value("review_not_eligible"));
    }

    @Test
    @DisplayName("a stranger with no relationship is refused")
    void strangerRefused() throws Exception {
        User owner = user("9821000002");
        listing(owner);

        review(user("9821000003"), owner, 422).andExpect(jsonPath("$.error").value("review_not_eligible"));
    }

    @Test
    @DisplayName("a pending contact request or a scheduled visit is not a relationship")
    void unfinishedInteractionsRefused() throws Exception {
        User owner = user("9821000004");
        User buyer = user("9821000005");
        Property p = listing(owner);
        contactRequests.saveAndFlush(new ContactRequest(p.getId(), buyer.getId(), "interested"));
        visits.saveAndFlush(new Visit(p.getId(), buyer.getId(), Instant.now().plus(1, ChronoUnit.DAYS),
                "in-person", null));

        review(buyer, owner, 422);
    }

    @Test
    @DisplayName("an approved contact request on one of the owner's listings is enough")
    void approvedContactMayReview() throws Exception {
        User owner = user("9821000006");
        User buyer = user("9821000007");
        ContactRequest cr = new ContactRequest(listing(owner).getId(), buyer.getId(), "interested");
        cr.setStatus(ContactRequestStatuses.APPROVED);
        contactRequests.saveAndFlush(cr);

        review(buyer, owner, 201);
    }

    @Test
    @DisplayName("a completed visit is enough")
    void completedVisitMayReview() throws Exception {
        User owner = user("9821000008");
        User buyer = user("9821000009");
        Visit v = new Visit(listing(owner).getId(), buyer.getId(), Instant.now().minus(2, ChronoUnit.DAYS),
                "in-person", null);
        v.setStatus(VisitStatuses.COMPLETED);
        visits.saveAndFlush(v);

        review(buyer, owner, 201);
    }

    @Test
    @DisplayName("an active or an ended tenancy is enough")
    void tenancyMayReview() throws Exception {
        User owner = user("9821000010");
        User active = user("9821000011");
        User ended = user("9821000012");
        Property p = listing(owner);
        tenancy(active, owner, p, TenancyStatuses.ACTIVE);
        tenancy(ended, owner, p, TenancyStatuses.ENDED);

        review(active, owner, 201);
        review(ended, owner, 201);
    }

    @Test
    @DisplayName("an accepted offer is enough")
    void acceptedOfferMayReview() throws Exception {
        User owner = user("9821000013");
        User buyer = user("9821000014");
        Offer offer = offers.saveAndFlush(new Offer(listing(owner).getId(), buyer.getId(), 20000L, null, null));
        jdbc.update("update offers set status = ? where id = ?", OfferStatuses.ACCEPTED, offer.getId());

        review(buyer, owner, 201);
    }

    @Test
    @DisplayName("a closed deal is enough")
    void closedDealMayReview() throws Exception {
        User owner = user("9821000015");
        User buyer = user("9821000016");
        Deal deal = new Deal(listing(owner).getId(), "rent");
        deal.setCounterpartyId(buyer.getId());
        deal.setStatus(DealStatuses.CLOSED);
        deals.saveAndFlush(deal);

        review(buyer, owner, 201);
    }

    @Test
    @DisplayName("an accepted finalization is enough")
    void acceptedFinalizationMayReview() throws Exception {
        User owner = user("9821000017");
        User buyer = user("9821000018");
        FinalizationRequest f = new FinalizationRequest(listing(owner).getId(), buyer.getId(), owner.getId(),
                20000L);
        f.setStatus(FinalizationStatuses.ACCEPTED);
        finalizations.saveAndFlush(f);

        review(buyer, owner, 201);
    }

    @Test
    @DisplayName("a relationship with a different owner does not carry over")
    void relationshipIsPerOwner() throws Exception {
        User owner = user("9821000019");
        User otherOwner = user("9821000020");
        User buyer = user("9821000021");
        tenancy(buyer, otherOwner, listing(otherOwner), TenancyStatuses.ACTIVE);

        review(buyer, owner, 422);
    }

    @Test
    @DisplayName("a pending or a declined tenancy is not a relationship")
    void unconfirmedTenancyRefused() throws Exception {
        User owner = user("9821000020");
        User pending = user("9821000021");
        User declined = user("9821000022");
        Property p = listing(owner);
        tenancy(pending, owner, p, TenancyStatuses.PENDING);
        tenancy(declined, owner, p, TenancyStatuses.DECLINED);

        review(pending, owner, 422).andExpect(jsonPath("$.error").value("review_not_eligible"));
        review(declined, owner, 422).andExpect(jsonPath("$.error").value("review_not_eligible"));
    }

    private org.springframework.test.web.servlet.ResultActions review(User author, User owner, int expected)
            throws Exception {
        return mvc.perform(post("/reviews/owner/" + owner.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":4,\"body\":\"Responsive and fair.\"}"))
                .andExpect(status().is(expected));
    }

    private User user(String mobile) {
        User u = new User(mobile, "buyer");
        u.setName("User " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "2BHK in Kothrud", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(PropertyStatus.APPROVED);
        return properties.saveAndFlush(p);
    }

    private void tenancy(User tenant, User owner, Property p, String status) {
        Tenancy t = new Tenancy(p.getId(), tenant.getId(), owner.getId());
        t.setStatus(status);
        tenancies.saveAndFlush(t);
    }
}
