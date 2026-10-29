package com.draazy.api.leads.notes;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class LeadNoteEndpointsTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    LeadNoteRepository leadNotes;

    private static final String DOC_KEY = "documents:99f1c0de-0000-4000-8000-000000000001|PROP1";

    private User owner(String mobile, String name) {
        User u = new User(mobile, "owner");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private URI noteUrl(String leadKey) {
        return URI.create(Routes.MeLeadNotes.BY_KEY.replace(
                "{leadKey}", URLEncoder.encode(leadKey, StandardCharsets.UTF_8)));
    }

    private MockHttpServletRequestBuilder save(User actor, String leadKey, String json) {
        return put(noteUrl(leadKey))
                .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json);
    }

    private MockHttpServletRequestBuilder list(User actor) {
        return get(Routes.MeLeadNotes.BASE).header(HttpHeaders.AUTHORIZATION, bearer(actor));
    }

    @Test
    void savingANote_returnsItUnderTheSameKey() throws Exception {
        User meera = owner("9000000200", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"Wants a site visit on Saturday","followUpAt":"2026-09-01T09:00:00Z"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.leadKey").value(DOC_KEY))
                .andExpect(jsonPath("$.note").value("Wants a site visit on Saturday"))
                .andExpect(jsonPath("$.followUpAt").value("2026-09-01T09:00:00Z"));

        mvc.perform(list(meera))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].leadKey").value(DOC_KEY));
    }

    @Test
    void savingTwiceUnderOneKey_updatesInPlace() throws Exception {
        User meera = owner("9000000201", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY, """
                {"note":"First pass","followUpAt":null}"""));
        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"Called, wants Sunday instead","followUpAt":null}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note").value("Called, wants Sunday instead"));

        assertThat(leadNotes.findByOwnerId(meera.getId())).hasSize(1);
    }

    @Test
    void aFollowUpDateAlone_isStored() throws Exception {
        User meera = owner("9000000202", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":null,"followUpAt":"2026-09-01T09:00:00Z"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note").doesNotExist())
                .andExpect(jsonPath("$.followUpAt").value("2026-09-01T09:00:00Z"));

        assertThat(leadNotes.findByOwnerId(meera.getId())).hasSize(1);
    }

    @Test
    void editingANote_returnsTheTimestampOfThatEdit() throws Exception {
        User meera = owner("9000000209", "Meera Joshi");

        String first = mvc.perform(save(meera, DOC_KEY, """
                        {"note":"First pass","followUpAt":null}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Instant firstStamp = Instant.parse(JsonPath.read(first, "$.updatedAt"));

        Thread.sleep(10);
        String second = mvc.perform(save(meera, DOC_KEY, """
                        {"note":"Second pass","followUpAt":null}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Instant secondStamp = Instant.parse(JsonPath.read(second, "$.updatedAt"));

        assertThat(secondStamp)
                .as("the response must carry the timestamp of the edit that produced it")
                .isAfter(firstStamp);
        assertThat(jdbc.queryForObject(
                        "select note from lead_notes where owner_id = ? and lead_key = ?",
                        String.class, meera.getId(), DOC_KEY))
                .as("and the edit must have reached the column, read outside the persistence"
                        + " context so an unflushed entity cannot satisfy it")
                .isEqualTo("Second pass");
    }

    @Test
    void anAbsurdlyLongKey_isRejected_andWritesNothing() throws Exception {
        User meera = owner("9000000210", "Meera Joshi");

        mvc.perform(save(meera, "x".repeat(3000), """
                        {"note":"payload","followUpAt":null}"""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("leadKey"));

        assertThat(leadNotes.findByOwnerId(meera.getId())).isEmpty();
    }

    @Test
    void anOwnerAtTheCeiling_cannotAddALead_butCanStillEditOne() throws Exception {
        User meera = owner("9000000211", "Meera Joshi");
        jdbc.update("""
                insert into lead_notes (id, owner_id, lead_key, note, created_at, updated_at)
                select gen_random_uuid(), ?, 'bulk:' || g, 'seeded', now(), now()
                from generate_series(1, ?) g""",
                meera.getId(), LeadNoteService.MAX_NOTES_PER_OWNER);

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"one lead too many","followUpAt":null}"""))
                .andExpect(status().isBadRequest());
        assertThat(leadNotes.findByOwnerIdAndLeadKey(meera.getId(), DOC_KEY)).isEmpty();

        mvc.perform(save(meera, "bulk:1", """
                        {"note":"corrected","followUpAt":null}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note").value("corrected"));
    }

    @Test
    void aFollowUpDatePastEitherEndOfTime_isRefused() throws Exception {
        User meera = owner("9000000212", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"someday","followUpAt":"+1000000000-12-31T23:59:59Z"}"""))
                .andExpect(status().isBadRequest());

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"someday","followUpAt":"-1000000000-01-01T00:00:00Z"}"""))
                .andExpect(status().isBadRequest());

        assertThat(leadNotes.findByOwnerId(meera.getId())).isEmpty();
    }

    @Test
    void anOverlongNote_isRejected_andWritesNothing() throws Exception {
        User meera = owner("9000000213", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY,
                        "{\"note\":\"" + "x".repeat(2001) + "\",\"followUpAt\":null}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("note"));

        assertThat(leadNotes.findByOwnerId(meera.getId())).isEmpty();
    }

    @Test
    void clearingAnAnnotation_removesTheRow() throws Exception {
        User meera = owner("9000000203", "Meera Joshi");
        mvc.perform(save(meera, DOC_KEY, """
                {"note":"Wants a site visit","followUpAt":null}"""));
        assertThat(leadNotes.findByOwnerId(meera.getId())).hasSize(1);

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"   ","followUpAt":null}"""))
                .andExpect(status().isNoContent());

        assertThat(leadNotes.findByOwnerId(meera.getId())).isEmpty();
        mvc.perform(list(meera)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void clearingSomethingThatWasNeverThere_is204() throws Exception {
        User meera = owner("9000000204", "Meera Joshi");

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":null,"followUpAt":null}"""))
                .andExpect(status().isNoContent());

        assertThat(leadNotes.findByOwnerId(meera.getId())).isEmpty();
    }

    @Test
    void twoOwnersAnnotatingTheSameKey_cannotSeeEachOther() throws Exception {
        User meera = owner("9000000205", "Meera Joshi");
        User rohan = owner("9000000206", "Rohan Kulkarni");

        mvc.perform(save(meera, DOC_KEY, """
                        {"note":"Meera private","followUpAt":null}"""))
                .andExpect(status().isOk());
        mvc.perform(save(rohan, DOC_KEY, """
                        {"note":"Rohan private","followUpAt":null}"""))
                .andExpect(status().isOk());

        mvc.perform(list(meera))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].note").value("Meera private"));
        mvc.perform(list(rohan))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].note").value("Rohan private"));
    }

    @Test
    void clearingIsOwnerScoped() throws Exception {
        User meera = owner("9000000207", "Meera Joshi");
        User rohan = owner("9000000208", "Rohan Kulkarni");
        mvc.perform(save(meera, DOC_KEY, """
                {"note":"Meera private","followUpAt":null}"""));

        mvc.perform(save(rohan, DOC_KEY, """
                        {"note":null,"followUpAt":null}"""))
                .andExpect(status().isNoContent());

        mvc.perform(list(meera))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].note").value("Meera private"));
    }

    @Test
    void anonymous_cannotReadOrWriteNotes() throws Exception {
        mvc.perform(get(Routes.MeLeadNotes.BASE)).andExpect(status().isUnauthorized());
        mvc.perform(put(noteUrl(DOC_KEY))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"note":"anon","followUpAt":null}"""))
                .andExpect(status().isUnauthorized());

        assertThat(jdbc.queryForObject("select count(*) from lead_notes", Long.class)).isZero();
    }
}
