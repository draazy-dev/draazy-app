package com.draazy.api.engagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Societies — merging duplicates")
class SocietyMergeTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    // REQUIRES_NEW audit rows survive rollback; sweep in a static hook, also before the run.
    @BeforeAll
    static void removeAuditRowsLeftByAnEarlierRun(@Autowired JdbcTemplate jdbc) {
        sweepOwnAuditRows(jdbc);
    }

    @AfterAll
    static void removeAuditRowsThatEscapedRollback(@Autowired JdbcTemplate jdbc) {
        sweepOwnAuditRows(jdbc);
    }

    private static void sweepOwnAuditRows(JdbcTemplate jdbc) {
        jdbc.update("delete from audit_log where entity = 'society' and entity_id like '%-d243'");
    }

    private User user(String mobile, String name) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String staff(String mobile) {
        User u = new User(mobile, Roles.Wire.STAFF);
        u.setName("Ops " + mobile.substring(6));
        u.setMobileVerified(true);
        return bearer(users.saveAndFlush(u));
    }

    private String society(User author, String name) throws Exception {
        ResultActions minted = mvc.perform(post("/societies")
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"placeId\":\"test-" + name.trim().toLowerCase().replaceAll("\\s+", "-") + "\",\"name\":\"" + name + "\",\"lat\":18.56,\"lng\":73.80}"))
                .andExpect(status().isCreated());
        String json = minted.andReturn().getResponse().getContentAsString();
        int at = json.indexOf("\"slug\":\"") + 8;
        return json.substring(at, json.indexOf('"', at));
    }

    private ResultActions merge(String ops, String from, String into) throws Exception {
        return mvc.perform(post("/admin/society-merges")
                .header(HttpHeaders.AUTHORIZATION, ops)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"" + from + "\",\"into\":\"" + into + "\"}"));
    }

    private ResultActions undo(String ops, String slug) throws Exception {
        return mvc.perform(delete("/admin/society-merges/" + slug)
                .header(HttpHeaders.AUTHORIZATION, ops));
    }

    private UUID id(String slug) {
        return jdbc.queryForObject("select id from societies where slug = ?", UUID.class, slug);
    }

    private Map<String, Object> row(String slug) {
        return jdbc.queryForMap(
                "select id, merged_into, merged_at, merged_by from societies where slug = ?", slug);
    }

    private Property listing(User owner, String title, UUID societyId) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setSocietyId(societyId);
        p.setStatus("approved");
        return properties.saveAndFlush(p);
    }

    private String directory(String q) throws Exception {
        return mvc.perform(get("/societies").param("q", q).param("size", "100"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("a merge one operator makes is a fact every other operator and searcher sees")
    void mergeIsSharedRatherThanHeldInOneBrowser() throws Exception {
        User author = user("9868000001", "Aarav Merge");
        String first = staff("9868000002");
        String second = staff("9868000003");

        String keep = society(author, "Sereno Heights D243");
        String duplicate = society(author, "Sereno Hights D243");

        merge(first, duplicate, keep)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value(duplicate))
                .andExpect(jsonPath("$.intoSlug").value(keep))
                .andExpect(jsonPath("$.mergedAt").exists())
                .andExpect(jsonPath("$.mergedBy").doesNotExist());

        String queue = mvc.perform(get("/admin/society-merges")
                        .header(HttpHeaders.AUTHORIZATION, second).param("size", "100"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(queue).contains("\"slug\":\"" + duplicate + "\"")
                .contains("\"intoSlug\":\"" + keep + "\"");

        String listed = directory("D243");
        assertThat(listed).contains(keep).doesNotContain("\"slug\":\"" + duplicate + "\"");
    }

    @Test
    @DisplayName("the merged-away slug keeps answering, with the surviving society")
    void theOldSlugResolvesToTheSurvivor() throws Exception {
        User author = user("9868000004", "Bhavna Merge");
        String ops = staff("9868000005");

        String keep = society(author, "Trellis Court D243");
        String duplicate = society(author, "Trelis Court D243");
        merge(ops, duplicate, keep).andExpect(status().isCreated());

        mvc.perform(get("/societies/" + duplicate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(keep))
                .andExpect(jsonPath("$.name").value("Trellis Court D243"));
    }

    @Test
    @DisplayName("the survivor shows the whole building, not the half of it that won")
    void theSurvivorAbsorbsWhatWasFiledAgainstTheDuplicate() throws Exception {
        User author = user("9868000006", "Chetan Merge");
        User follower = user("9868000007", "Divya Merge");
        String ops = staff("9868000008");

        String keep = society(author, "Willowmere D243");
        String duplicate = society(author, "Willowmeer D243");

        listing(author, "2 BHK in Willowmere D243", id(keep));
        listing(author, "2 BHK in the other Willowmere D243", id(duplicate));

        mvc.perform(put("/me/societies/" + duplicate + "/follow")
                .header(HttpHeaders.AUTHORIZATION, bearer(follower))).andExpect(status().isNoContent());

        merge(ops, duplicate, keep).andExpect(status().isCreated());

        mvc.perform(get("/societies/" + keep))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listingCount").value(2))
                .andExpect(jsonPath("$.homes.length()").value(2));

        mvc.perform(get("/me/societies/following")
                        .header(HttpHeaders.AUTHORIZATION, bearer(follower)))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    @DisplayName("a survivor whose only homes are on the duplicate still has homes")
    void hasListingsSeesTheWholeMergeFamily() throws Exception {
        User author = user("9868000021", "Farhan Merge");
        String ops = staff("9868000022");

        String keep = society(author, "Juniper Rise D243");
        String duplicate = society(author, "Junipar Rise D243");

        listing(author, "2 BHK in Juniper Rise D243", id(duplicate));
        merge(ops, duplicate, keep).andExpect(status().isCreated());

        mvc.perform(get("/societies").param("q", "Juniper Rise D243").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].slug").value(keep))
                .andExpect(jsonPath("$.content[0].listingCount").value(1));

        mvc.perform(get("/societies")
                        .param("q", "Juniper Rise D243").param("hasListings", "true").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].slug").value(keep));

        String quiet = society(author, "Juniper Rise D243 Annexe");
        mvc.perform(get("/societies")
                        .param("q", "Juniper Rise D243 Annexe").param("size", "100"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].slug").value(quiet));
        mvc.perform(get("/societies")
                        .param("q", "Juniper Rise D243 Annexe").param("hasListings", "true").param("size", "100"))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    @DisplayName("a merge moves nothing and deletes nothing")
    void theDuplicateAndItsListingsAreLeftWhereTheyAre() throws Exception {
        User author = user("9868000009", "Esha Merge");
        String ops = staff("9868000010");

        String keep = society(author, "Marigold Enclave D243");
        String duplicate = society(author, "Marygold Enclave D243");
        UUID duplicateId = id(duplicate);
        Property filed = listing(author, "3 BHK in Marygold D243", duplicateId);

        merge(ops, duplicate, keep).andExpect(status().isCreated());

        assertThat(jdbc.queryForObject("select society_id from properties where id = ?",
                UUID.class, filed.getId())).isEqualTo(duplicateId);

        Map<String, Object> stored = row(duplicate);
        assertThat(stored.get("merged_into")).isEqualTo(id(keep));
        assertThat(stored.get("merged_at")).isNotNull();
        assertThat(stored.get("merged_by")).isNotNull();
    }

    @Test
    @DisplayName("a society cannot be merged into itself")
    void selfMergeIsRefused() throws Exception {
        User author = user("9868000011", "Farhan Merge");
        String ops = staff("9868000012");
        String slug = society(author, "Cypress Row D243");

        merge(ops, slug, slug).andExpect(status().isUnprocessableEntity());
        assertThat(row(slug).get("merged_into")).isNull();
    }

    @Test
    @DisplayName("merges cannot be chained, in either direction")
    void chainsAreRefusedFromBothEnds() throws Exception {
        User author = user("9868000013", "Gauri Merge");
        String ops = staff("9868000014");

        String a = society(author, "Lantern Bay D243");
        String b = society(author, "Lantren Bay D243");
        String c = society(author, "Lanturn Bay D243");
        merge(ops, b, a).andExpect(status().isCreated());

        merge(ops, a, c)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString(b)));

        merge(ops, c, b).andExpect(status().isConflict());

        assertThat(row(a).get("merged_into")).isNull();
        assertThat(row(c).get("merged_into")).isNull();
    }

    @Test
    @DisplayName("merging the same society twice tells the second operator who won")
    void aSecondMergeOfTheSameSocietyIsAConflict() throws Exception {
        User author = user("9868000015", "Hiten Merge");
        String first = staff("9868000016");
        String second = staff("9868000017");

        String keep = society(author, "Pinehurst D243");
        String other = society(author, "Pinehirst D243");
        String duplicate = society(author, "Pine Hurst D243");

        merge(first, duplicate, keep).andExpect(status().isCreated());

        merge(second, duplicate, other).andExpect(status().isConflict());
        assertThat(row(duplicate).get("merged_into")).isEqualTo(id(keep));
    }

    @Test
    @DisplayName("merging is a back-office write, not something a member can do")
    void mergingIsStaffAndWriteScoped() throws Exception {
        User buyer = user("9868000018", "Ishan Merge");
        String keep = society(buyer, "Kestrel Park D243");
        String duplicate = society(buyer, "Kestral Park D243");

        mvc.perform(post("/admin/society-merges")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"" + duplicate + "\",\"into\":\"" + keep + "\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(get("/admin/society-merges")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an undo puts the society back exactly as it was, and both decisions are in the audit log")
    void undoRestoresTheDuplicate() throws Exception {
        User author = user("9868000019", "Jyoti Merge");
        String ops = staff("9868000020");

        String keep = society(author, "Solstice Grove D243");
        String duplicate = society(author, "Solstise Grove D243");
        merge(ops, duplicate, keep).andExpect(status().isCreated());
        assertThat(auditCount("society.merge", duplicate)).isOne();

        undo(ops, duplicate).andExpect(status().isNoContent());

        assertThat(auditCount("society.unmerge", duplicate)).isOne();

        Map<String, Object> stored = row(duplicate);
        assertThat(stored.get("merged_into")).isNull();
        assertThat(stored.get("merged_at")).isNull();
        assertThat(stored.get("merged_by")).isNull();

        assertThat(directory("D243")).contains("\"slug\":\"" + duplicate + "\"");
        mvc.perform(get("/societies/" + duplicate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(duplicate));
    }

    @Test
    @DisplayName("undoing a merge that was never made is a 404, not a silent success")
    void undoOfAnUnmergedSocietyIsNotFound() throws Exception {
        User author = user("9868000021", "Kabir Merge");
        String ops = staff("9868000022");
        String slug = society(author, "Beacon Rise D243");

        undo(ops, slug).andExpect(status().isNotFound());
        undo(ops, "no-such-society-d243").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a merged-away society leaves the candidates queue")
    void theDuplicateLeavesTheQueue() throws Exception {
        User author = user("9868000023", "Leela Merge");
        String ops = staff("9868000024");

        String keep = society(author, "Orchid Meadows D243");
        String duplicate = society(author, "Orkid Meadows D243");
        merge(ops, duplicate, keep).andExpect(status().isCreated());

        String queue = mvc.perform(get("/admin/society-candidates")
                        .header(HttpHeaders.AUTHORIZATION, ops).param("size", "200"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(queue).doesNotContain("\"slug\":\"" + duplicate + "\"")
                .contains("\"slug\":\"" + keep + "\"");
    }

    @Test
    @DisplayName("adding the duplicate's place again returns the society it was merged into")
    void mintingTheOldNameLandsOnTheSurvivor() throws Exception {
        User author = user("9868000025", "Manav Merge");
        User member = user("9868000026", "Nisha Merge");
        String ops = staff("9868000027");

        String keep = society(author, "Aster Vale D243");
        String duplicate = society(author, "Astar Vale D243");
        merge(ops, duplicate, keep).andExpect(status().isCreated());

        mvc.perform(post("/societies")
                        .header(HttpHeaders.AUTHORIZATION, bearer(member))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"placeId\":\"test-astar-vale-d243\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(keep));
    }

    private Integer auditCount(String action, String slug) {
        return jdbc.queryForObject(
                "select count(*) from audit_log where action = ? and entity_id = ?",
                Integer.class, action, slug);
    }
}
