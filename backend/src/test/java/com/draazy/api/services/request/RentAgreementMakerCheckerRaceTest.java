package com.draazy.api.services.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.Document;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.identity.user.User;
import com.draazy.api.provider.OtpSender;
import com.draazy.api.security.Teams;
import com.draazy.api.support.AbstractCommittedApiTest;
import com.draazy.api.support.Races;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;

@DisplayName("Rent agreement maker-checker races: one decision wins, the other is a clean 409")
class RentAgreementMakerCheckerRaceTest extends AbstractCommittedApiTest {

    @Autowired ServiceRequestRepository requests;
    @MockitoSpyBean ServiceRequestDraftApprovals approvals;
    @MockitoSpyBean OtpSender sender;
    @Autowired ServiceRequestPartyRepository parties;
    @Autowired DocumentRepository documents;
    @Autowired ServiceRequestDocumentReviewRepository reviews;
    @Autowired TransactionTemplate tx;

    private static final String INLINE_TENANT = "9791521099";

    @Override
    protected String mobilePrefix() {
        return "97915210";
    }

    @AfterEach
    void sweepRequests() {
        tx.executeWithoutResult(s -> {
            String mine = "(select id from service_requests where requester_id in "
                    + "(select id from users where mobile like '" + mobilePrefix() + "%'))";
            for (String child : List.of("service_request_timeline",
                    "service_request_draft_approvals", "service_request_parties")) {
                jdbc.update("delete from " + child + " where request_id in " + mine);
            }
            jdbc.update("delete from service_request_document_reviews where service_request_id in " + mine);
            jdbc.update("delete from documents where service_request_id in " + mine);
            jdbc.update("delete from service_requests where id in " + mine);
            jdbc.update("delete from otp_codes where mobile = ?", INLINE_TENANT);
        });
    }

    @Test
    @DisplayName("the last two parties approving at once still move the request to approved")
    void partiesApprovingTogetherComplete() {
        User owner = user("05", "buyer");
        User tenant = user("06", "buyer");
        User holder = deskStaff("07");
        UUID id = filed(owner, holder, ServiceRequestStatus.DRAFT_SHARED, 25_000);
        tx.executeWithoutResult(s -> {
            ServiceRequestParty party = new ServiceRequestParty(id, tenant.getId(), "tenant", 0, owner.getId());
            party.answer(CoFillParties.ACCEPTED);
            parties.save(party);
        });
        User[] signers = {owner, tenant};
        for (User signer : signers) {
            assertThat(send(Routes.ServiceRequests.DRAFT_OPENED, signer, "{}", id)).isEqualTo(204);
        }
        List<Integer> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(2, i -> outcomes.add(send(Routes.ServiceRequests.DRAFT_DECISION, signers[i],
                "{\"decision\":\"approve\"}", id)));

        assertThat(outcomes).as("outcomes=" + outcomes).containsOnly(200);
        assertThat(jdbc.queryForObject("select status from service_requests where id = ?", String.class, id))
                .isEqualTo("approved");
    }

    @Test
    @DisplayName("a revision racing the last approval: exactly one wins, and an approved request never has an unseen revision")
    void shareRacingApprovalHasOneWinner() {
        User owner = user("08", "buyer");
        User holder = deskStaff("09");
        UUID id = filed(owner, holder, ServiceRequestStatus.DRAFT_SHARED, 55_000);
        tx.executeWithoutResult(s -> DocumentReviewFixture.verifyAll(requests, documents, reviews, id));
        assertThat(send(Routes.ServiceRequests.DRAFT_OPENED, owner, "{}", id)).isEqualTo(204);
        List<Integer> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(2, i -> outcomes.add(i == 0 ? share(holder, id)
                : send(Routes.ServiceRequests.DRAFT_DECISION, owner, "{\"decision\":\"approve\"}", id)));

        String status = jdbc.queryForObject("select status from service_requests where id = ?", String.class, id);
        long drafts = count("select count(*) from documents where service_request_id = ? and category = 'draft'", id);
        assertThat(status + "/drafts=" + drafts).as("outcomes=" + outcomes)
                .isIn("approved/drafts=1", "draft-shared/drafts=2");
        assertThat(outcomes).as("outcomes=" + outcomes).containsExactlyInAnyOrder(200, 409);
    }

    @Test
    @DisplayName("a re-share landing while an approval OTP is sent: the code is voided and the send is refused")
    void otpSentAcrossAReshareIsVoided() throws Exception {
        User owner = user("10", "buyer");
        User holder = deskStaff("11");
        UUID id = sharedV1(owner, holder, Map.of("owner", Map.of("oMobile", owner.getMobile()),
                "tenants", List.of(Map.of("name", "Ria", "mobile", INLINE_TENANT))));
        String partyKey = "tenant:0:" + Tokens.sha256Hex(INLINE_TENANT);
        Thread caller = Thread.currentThread();
        doAnswer(inv -> {
            if (Thread.currentThread() == caller) {
                reshareMeanwhile(holder, id);
            }
            return inv.callRealMethod();
        }).when(sender).send(anyString(), anyString());

        int otp = send(Routes.ServiceRequests.DRAFT_OTP, owner, "{\"partyKey\":\"" + partyKey + "\"}", id);

        assertThat(otp).isEqualTo(409);
        assertThat(count("select count(*) from otp_codes where purpose like ?", "draft-approval:" + id + "%"))
                .isZero();
    }

    @Test
    @DisplayName("a re-share landing while the draft is being opened: the receipt never lands on the new version")
    void openingAcrossAReshareNeverMarksTheNewVersion() throws Exception {
        User owner = user("12", "buyer");
        User holder = deskStaff("13");
        UUID id = sharedV1(owner, holder, Map.of());
        Thread caller = Thread.currentThread();
        Thread[] share = new Thread[1];
        doAnswer(inv -> {
            if (Thread.currentThread() == caller && share[0] == null) {
                share[0] = reshareMeanwhile(holder, id);
            }
            return inv.callRealMethod();
        }).when(approvals).markOpened(any(), any());

        int opened = send(Routes.ServiceRequests.DRAFT_OPENED, owner, "{}", id);
        share[0].join(10_000);

        assertThat(opened).isEqualTo(204);
        assertThat(count("select count(*) from service_request_draft_approvals where request_id = ? "
                + "and draft_version = 2 and opened_at is not null", id)).isZero();
        assertThat(count("select count(*) from documents where service_request_id = ? and category = 'draft'", id))
                .isEqualTo(2L);
    }

    private UUID sharedV1(User owner, User holder, Map<String, Object> state) {
        UUID id = filed(owner, holder, ServiceRequestStatus.DRAFT_SHARED, 55_000, state);
        tx.executeWithoutResult(s -> DocumentReviewFixture.verifyAll(requests, documents, reviews, id));
        return id;
    }

    // Runs the share on its own thread and gives it a moment; a correct lock keeps it waiting until we commit.
    private Thread reshareMeanwhile(User holder, UUID id) throws InterruptedException {
        Thread share = new Thread(() -> share(holder, id));
        share.start();
        share.join(2_000);
        return share;
    }

    private int share(User holder, UUID id) {
        try {
            return mvc.perform(multipart(Routes.ServiceRequests.DRAFT, id)
                            .file(new MockMultipartFile("file", "draft.pdf", "application/pdf",
                                    "%PDF-1.4 v2".getBytes()))
                            .param("checks", "identity", "title", "poa", "address", "terms")
                            .header(HttpHeaders.AUTHORIZATION, bearer(holder)))
                    .andReturn().getResponse().getStatus();
        } catch (Exception thrown) {
            throw new IllegalStateException(thrown);
        }
    }

    private User deskStaff(String suffix) {
        User staff = user(suffix, "staff");
        jdbc.update("update users set team = ? where id = ?", Teams.RENTAL, staff.getId());
        jdbc.update("""
                insert into back_office_permissions (user_id, permissions)
                values (?::uuid, ?::jsonb)
                on conflict (user_id) do update set permissions = excluded.permissions
                """, staff.getId().toString(), "[\"support\",\"desk:" + Teams.RENTAL + "\"]");
        return users.findById(staff.getId()).orElseThrow();
    }


    private UUID filed(User owner, User holder, ServiceRequestStatus status, long rent) {
        return filed(owner, holder, status, rent, Map.of());
    }

    private UUID filed(User owner, User holder, ServiceRequestStatus status, long rent, Map<String, Object> state) {
        Map<String, Object> wizard = new HashMap<>(state);
        wizard.put("terms", Map.of("rent", String.valueOf(rent)));
        return tx.execute(s -> {
            ServiceRequest request = new ServiceRequest(owner.getId(), ServiceRequestTypes.RENT_AGREEMENT, null,
                    Map.of("rent", rent, "_state", wizard), null);
            request.awaitPayment(2_699L);
            request.moveTo(status);
            request.setAssigneeId(holder.getId());
            UUID id = requests.saveAndFlush(request).getId();
            documents.saveAndFlush(new Document(null, id, "draft", "draft.pdf",
                    "documents/service-requests/" + id + "/" + UUID.randomUUID(), 1L, "application/pdf"));
            return id;
        });
    }

    private int send(String path, User caller, String body, Object... vars) {
        try {
            return mvc.perform(post(path, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andReturn().getResponse().getStatus();
        } catch (Exception thrown) {
            throw new IllegalStateException(thrown);
        }
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }
}
