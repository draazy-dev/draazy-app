package com.draazy.api.identity.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Identity appeal — a rejected check can be appealed and decided by a different reviewer")
class IdentityAppealEndpointsTest extends AbstractApiTest {

    private static final String NOTE = "My ID is valid, the photo was just taken in poor light.";

    @Autowired
    UserRepository users;

    @Autowired
    IdentityVerificationRepository verifications;

    @Autowired
    IdentityVerificationService identity;

    @AfterEach
    void cleanAuditRows() {
        jdbc.update("delete from audit_log where action like 'identity.appeal.%'");
    }

    @Test
    @DisplayName("opening an appeal files an ops-queue ticket, redacts numbers and audits it")
    void opensTicketRedactsAndAudits() throws Exception {
        User applicant = person("9849100001", Roles.Wire.BUYER);
        IdentityVerification v = rejected(applicant, person("9849100002", Roles.Wire.ADMIN));

        appeal(applicant, "Please recheck. PAN ABCDE1234F, call 9876543210.")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.note").value("Please recheck. PAN [redacted], call [redacted]."));

        UUID ticketId = jdbc.queryForObject("select ticket_id from identity_appeals where verification_id = ?",
                UUID.class, v.getId());
        assertThat(jdbc.queryForMap("select category, status, staff_unread from support_tickets where id = ?",
                ticketId))
                .containsEntry("category", "identity_appeal")
                .containsEntry("status", "open")
                .containsEntry("staff_unread", true);
        assertThat(jdbc.queryForObject("select body from support_ticket_messages where ticket_id = ?",
                String.class, ticketId)).doesNotContain("ABCDE1234F", "9876543210");
        assertThat(auditCount("identity.appeal.opened", v.getId())).isEqualTo(1);
        me(applicant).andExpect(jsonPath("$.appeal.status").value("open"))
                .andExpect(jsonPath("$.canAppeal").value(false));
    }

    @Test
    @DisplayName("only a rejected check may be appealed, with a valid note")
    void refusesWhenNotRejectedOrNoteInvalid() throws Exception {
        User noCase = person("9849100003", Roles.Wire.BUYER);
        appeal(noCase, NOTE).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED));

        User pending = person("9849100004", Roles.Wire.BUYER);
        verifications.saveAndFlush(new IdentityVerification(pending.getId(), IdentityDocTypes.PAN, Instant.now()));
        appeal(pending, NOTE).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED));

        User rejected = person("9849100005", Roles.Wire.BUYER);
        rejected(rejected, person("9849100006", Roles.Wire.ADMIN));
        appeal(rejected, "  ").andExpect(status().isBadRequest());
        appeal(rejected, "x".repeat(501)).andExpect(status().isBadRequest());
        assertThat(count("identity_appeals")).isZero();
    }

    @Test
    @DisplayName("a second open appeal is refused with a clear 409")
    void refusesSecondOpenAppeal() throws Exception {
        User applicant = person("9849100007", Roles.Wire.BUYER);
        IdentityVerification v = rejected(applicant, person("9849100008", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());

        appeal(applicant, NOTE).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_OPEN))
                .andExpect(jsonPath("$.message").value("An appeal is already open"));
        assertThat(jdbc.queryForObject("select count(*) from identity_appeals where verification_id = ?",
                Long.class, v.getId())).isEqualTo(1L);
    }

    @Test
    @DisplayName("a rejection whose photos were purged cannot be appealed")
    void refusesWhenPhotosPurged() throws Exception {
        User applicant = person("9849100009", Roles.Wire.BUYER);
        IdentityVerification v = rejected(applicant, person("9849100010", Roles.Wire.ADMIN));
        v.setFilesPurgedAt(Instant.now());
        verifications.saveAndFlush(v);

        appeal(applicant, NOTE).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED));
        me(applicant).andExpect(jsonPath("$.canAppeal").value(false));
    }

    @Test
    @DisplayName("an open appeal shows in the appeal tab with its note, and only a different reviewer may decide")
    void queueShowsAppealAndFlagsWhoCanDecide() throws Exception {
        User applicant = person("9849100011", Roles.Wire.BUYER);
        User rejecter = person("9849100012", Roles.Wire.ADMIN);
        User other = person("9849100013", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, rejecter);
        appeal(applicant, NOTE).andExpect(status().isCreated());

        queue(other, "appeal").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + v.getId() + "')].appeal").value(true));
        queue(other, "pending").andExpect(jsonPath("$.content[?(@.id=='" + v.getId() + "')]").isEmpty());
        mvc.perform(get(Routes.Moderation.IDENTITY_REVIEW_SUMMARY).header(HttpHeaders.AUTHORIZATION, bearer(other)))
                .andExpect(jsonPath("$.appeals").value(1));
        detail(other, v).andExpect(jsonPath("$.appeal.note").value(NOTE))
                .andExpect(jsonPath("$.appealCanDecide").value(true));
        detail(rejecter, v).andExpect(jsonPath("$.appealCanDecide").value(false));
    }

    @Test
    @DisplayName("the reviewer who rejected the case cannot decide its appeal")
    void sameReviewerRefused() throws Exception {
        User applicant = person("9849100014", Roles.Wire.BUYER);
        User rejecter = person("9849100015", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, rejecter);
        appeal(applicant, NOTE).andExpect(status().isCreated());

        decide(rejecter, v, "uphold").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_SAME_REVIEWER));
        decide(rejecter, v, "reopen").andExpect(status().isForbidden());
        assertThat(appealStatus(v)).isEqualTo("open");
        assertThat(verifications.findById(v.getId()).orElseThrow().getStatus())
                .isEqualTo(VerificationStatuses.REJECTED);
    }

    @Test
    @DisplayName("uphold keeps the rejection, closes the ticket, tells the user and audits")
    void upholdKeepsRejection() throws Exception {
        User applicant = person("9849100016", Roles.Wire.BUYER);
        User other = person("9849100017", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, person("9849100018", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());

        decide(other, v, "uphold").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("upheld"));

        assertThat(verifications.findById(v.getId()).orElseThrow().getStatus())
                .isEqualTo(VerificationStatuses.REJECTED);
        assertThat(ticketStatus(v)).isEqualTo("closed");
        assertThat(notices(applicant, "identity.appeal.upheld")).isEqualTo(1);
        assertThat(auditCount("identity.appeal.upheld", v.getId())).isEqualTo(1);
        me(applicant).andExpect(jsonPath("$.status").value("rejected"))
                .andExpect(jsonPath("$.appeal.status").value("upheld"))
                .andExpect(jsonPath("$.canAppeal").value(false));
        appeal(applicant, NOTE).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED));
        decide(other, v, "uphold").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NONE));
    }

    @Test
    @DisplayName("reopen returns the case to pending without touching attempt counters")
    void reopenReturnsCaseToPending() throws Exception {
        User applicant = person("9849100019", Roles.Wire.BUYER);
        User other = person("9849100020", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, person("9849100021", Roles.Wire.ADMIN));
        v.setAttemptCount(2);
        verifications.saveAndFlush(v);
        appeal(applicant, NOTE).andExpect(status().isCreated());

        decide(other, v, "reopen").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("reopened"));

        IdentityVerification after = verifications.findById(v.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(VerificationStatuses.PENDING);
        assertThat(after.getAttemptCount()).isEqualTo(2);
        assertThat(after.getReviewerId()).isNull();
        assertThat(after.getDecidedAt()).isNull();
        assertThat(after.getRejectionReason()).isNull();
        assertThat(after.getSubmittedAt()).isAfter(Instant.now().minusSeconds(60));
        assertThat(ticketStatus(v)).isEqualTo("closed");
        assertThat(notices(applicant, "identity.appeal.reopened")).isEqualTo(1);
        assertThat(auditCount("identity.appeal.reopened", v.getId())).isEqualTo(1);
        queue(other, "pending").andExpect(jsonPath("$.content[?(@.id=='" + v.getId() + "')]").isNotEmpty());
        me(applicant).andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.appeal.status").value("reopened"));
        decide(other, v, "reopen").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("reopen is refused once the photos were purged, leaving the appeal open")
    void reopenRefusedAfterPurge() throws Exception {
        User applicant = person("9849100022", Roles.Wire.BUYER);
        User other = person("9849100023", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, person("9849100024", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());
        v.setFilesPurgedAt(Instant.now());
        verifications.saveAndFlush(v);

        decide(other, v, "reopen").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED));
        assertThat(appealStatus(v)).isEqualTo("open");
        assertThat(verifications.findById(v.getId()).orElseThrow().getStatus())
                .isEqualTo(VerificationStatuses.REJECTED);
    }

    @Test
    @DisplayName("trying again while an appeal is open supersedes it and closes its ticket")
    void resubmitSupersedesOpenAppeal() throws Exception {
        User applicant = person("9849100025", Roles.Wire.BUYER);
        IdentityVerification v = rejected(applicant, person("9849100026", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());

        mvc.perform(multipart(Routes.Verification.IDENTITY)
                        .file(png("front")).file(png("selfie"))
                        .param("docType", IdentityDocTypes.PAN).param("consent", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(applicant)))
                .andExpect(status().is2xxSuccessful());

        assertThat(appealStatus(v)).isEqualTo("superseded");
        assertThat(ticketStatus(v)).isEqualTo("closed");
        me(applicant).andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.appeal").doesNotExist());
    }

    @Test
    @DisplayName("another user cannot appeal, see or decide someone else's appeal")
    void otherUsersAreShutOut() throws Exception {
        User applicant = person("9849100027", Roles.Wire.BUYER);
        User stranger = person("9849100028", Roles.Wire.BUYER);
        IdentityVerification v = rejected(applicant, person("9849100029", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());
        UUID ticketId = jdbc.queryForObject("select ticket_id from identity_appeals where verification_id = ?",
                UUID.class, v.getId());

        me(stranger).andExpect(jsonPath("$.status").value("none"))
                .andExpect(jsonPath("$.appeal").doesNotExist());
        appeal(stranger, NOTE).andExpect(status().isConflict());
        decide(stranger, v, "uphold").andExpect(status().isForbidden());
        decide(stranger, v, "reopen").andExpect(status().isForbidden());
        mvc.perform(get(Routes.SupportTickets.BASE + "/" + ticketId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        assertThat(appealStatus(v)).isEqualTo("open");
        mvc.perform(post(Routes.Verification.IDENTITY_APPEAL).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an open appeal keeps the photos; once decided the retention clock restarts from the decision")
    void purgeSparesOpenAppealAndRestartsClockAfterDecision() throws Exception {
        User applicant = person("9849100030", Roles.Wire.BUYER);
        User other = person("9849100031", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, person("9849100032", Roles.Wire.ADMIN));
        IdentityVerification plain = rejected(person("9849100033", Roles.Wire.BUYER), other);
        appeal(applicant, NOTE).andExpect(status().isCreated());
        Instant old = Instant.now().minus(Duration.ofDays(10));
        v.setDecidedAt(old);
        plain.setDecidedAt(old);
        verifications.saveAndFlush(v);
        verifications.saveAndFlush(plain);

        identity.purgeExpiredFiles(7);
        assertThat(purgedAt(plain)).isNotNull();
        assertThat(purgedAt(v)).isNull();

        decide(other, v, "uphold").andExpect(status().isOk());
        identity.purgeExpiredFiles(7);
        assertThat(purgedAt(v)).isNull();

        jdbc.update("update identity_appeals set decided_at = ? where verification_id = ?",
                Timestamp.from(old), v.getId());
        identity.purgeExpiredFiles(7);
        assertThat(purgedAt(v)).isNotNull();
    }

    @Test
    @DisplayName("reopen is offered only while the photos exist; uphold stays available")
    void reopenNotOfferedOncePurged() throws Exception {
        User applicant = person("9849100034", Roles.Wire.BUYER);
        User other = person("9849100035", Roles.Wire.ADMIN);
        IdentityVerification v = rejected(applicant, person("9849100036", Roles.Wire.ADMIN));
        appeal(applicant, NOTE).andExpect(status().isCreated());

        detail(other, v).andExpect(jsonPath("$.appealCanDecide").value(true))
                .andExpect(jsonPath("$.appealCanReopen").value(true));
        v.setFilesPurgedAt(Instant.now());
        verifications.saveAndFlush(v);

        detail(other, v).andExpect(jsonPath("$.appealCanDecide").value(true))
                .andExpect(jsonPath("$.appealCanReopen").value(false));
        detail(person("9849100037", Roles.Wire.ADMIN), v).andExpect(jsonPath("$.appealCanReopen").value(false));
        decide(other, v, "uphold").andExpect(status().isOk());
    }

    private Timestamp purgedAt(IdentityVerification v) {
        verifications.flush();
        return jdbc.queryForObject("select files_purged_at from identity_verifications where id = ?",
                Timestamp.class, v.getId());
    }

    private ResultActions appeal(User caller, String note) throws Exception {
        return mvc.perform(post(Routes.Verification.IDENTITY_APPEAL)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"" + note + "\"}"));
    }

    private ResultActions me(User caller) throws Exception {
        return mvc.perform(get(Routes.Verification.IDENTITY).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions queue(User staff, String status) throws Exception {
        return mvc.perform(get(Routes.Moderation.IDENTITY_REVIEWS).param("status", status).param("size", "100")
                .header(HttpHeaders.AUTHORIZATION, bearer(staff)));
    }

    private ResultActions detail(User staff, IdentityVerification v) throws Exception {
        return mvc.perform(get(Routes.Moderation.IDENTITY_REVIEW_BY_ID.replace("{id}", v.getId().toString()))
                .header(HttpHeaders.AUTHORIZATION, bearer(staff)));
    }

    private ResultActions decide(User staff, IdentityVerification v, String outcome) throws Exception {
        return mvc.perform(post(Routes.Moderation.IDENTITY_REVIEW_BY_ID.replace("{id}", v.getId().toString())
                + "/appeal/" + outcome).header(HttpHeaders.AUTHORIZATION, bearer(staff)));
    }

    private IdentityVerification rejected(User applicant, User rejecter) {
        IdentityVerification v = new IdentityVerification(applicant.getId(), IdentityDocTypes.PAN,
                Instant.now().minusSeconds(3600));
        v.setStatus(VerificationStatuses.REJECTED);
        v.setRejectionReason("blurry");
        v.setReviewerId(rejecter.getId());
        v.setDecidedAt(Instant.now());
        v.setConsentNoticeVersion("2026-09");
        v.setConsentLanguage("en");
        return verifications.saveAndFlush(v);
    }

    private User person(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String appealStatus(IdentityVerification v) {
        return jdbc.queryForObject("select status from identity_appeals where verification_id = ?",
                String.class, v.getId());
    }

    private String ticketStatus(IdentityVerification v) {
        return jdbc.queryForObject("""
                select t.status from support_tickets t join identity_appeals a on a.ticket_id = t.id
                 where a.verification_id = ?""", String.class, v.getId());
    }

    private long auditCount(String action, UUID verificationId) {
        return jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?",
                Long.class, action, verificationId.toString());
    }

    private long notices(User user, String type) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?",
                Long.class, user.getId(), type);
    }

    private long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    private static MockMultipartFile png(String field) {
        byte[] pngMagic = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
        return new MockMultipartFile(field, field + ".png", "image/png", pngMagic);
    }
}
