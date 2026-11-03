package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Flatmate case files — the three ticks, Needs info and the Support thread")
class FlatmateCaseFileTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String mobile, String name, String role) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private User host(String mobile) {
        return user(mobile, "Host " + mobile, Roles.Wire.BUYER);
    }

    private User desk(String mobile) {
        return user(mobile, "Desk " + mobile, Roles.Wire.ADMIN);
    }

    private static String idIn(String json) {
        return json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String createRoom(User host, String locality) throws Exception {
        return idIn(mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(roomBody(host, locality)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private static String roomBody(User host, String locality) {
        return """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"%s","society":"Case House","rentShare":15000,"deposit":30000,
                 "availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any",
                 %s,"hostRole":"owner","note":"Sunny room.",%s,%s}
                """.formatted(locality, FlatmateRoomFixture.photos(host.getId()),
                FlatmateRoomFixture.BASICS, FlatmateRoomFixture.DETAILS);
    }

    private String createHuntingGroup(User host, String locality) throws Exception {
        return idIn(mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Hunting together","policy":"any","seats":3,"seatsOpen":1,
                                 "name":"Host",
                                 "preferences":{"localities":["%s"],"bhk":["2"],"rentMin":30000,
                                   "rentMax":45000,"depositMax":100000,"gatedOnly":false,"bachelors":false}}
                                """.formatted(locality)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private String createPost(User author, String locality) throws Exception {
        return idIn(mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Seeker","gender":"any","age":27,"budget":18000,
                                 "localities":["%s"],"moveIn":"2026-09-01",
                                 "flatPref":"any","roomPref":"private","note":"Quiet."}
                                """.formatted(locality)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.modStatus").value("live"))
                .andReturn().getResponse().getContentAsString());
    }

    private ResultActions moderate(User by, String id, String json) throws Exception {
        return mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(by))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private ResultActions approve(User by, String id) throws Exception {
        return moderate(by, id, "{\"modStatus\":\"approved\"}");
    }

    private ResultActions needsInfo(User by, String id, String reason, String note) throws Exception {
        return moderate(by, id, "{\"modStatus\":\"needs_info\",\"reasonCode\":" + reason
                + ",\"note\":" + note + "}");
    }

    private ResultActions thread(User by, String kind, String id) throws Exception {
        return mvc.perform(get(Routes.Flatmates.CASE, kind, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(by)));
    }

    private ResultActions reply(User by, String kind, String id, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.CASE_MESSAGES, kind, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(by))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"" + body + "\"}"));
    }

    private String modStatusOf(String table, String id) {
        return jdbc.queryForObject("select mod_status from " + table + " where id = ?::uuid",
                String.class, id);
    }

    @Nested
    @DisplayName("publication parity — a room or flat-holding group needs the three ticks")
    class Publication {
        @Test
        @DisplayName("a room is not published until every check is ticked")
        void roomNeedsAllTicks() throws Exception {
            User author = host("9814000001");
            User staff = desk("9814000002");
            String id = createRoom(author, "Baner");

            approve(staff, id).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("checklist_incomplete"));
            FlatmateDeskTicks.tick(mvc, bearer(staff), id, FlatmateDeskTicks.CHECKS.get(0), true);
            FlatmateDeskTicks.tick(mvc, bearer(staff), id, FlatmateDeskTicks.CHECKS.get(1), true);
            approve(staff, id).andExpect(status().isConflict());
            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("pending");

            FlatmateDeskTicks.tick(mvc, bearer(staff), id, FlatmateDeskTicks.CHECKS.get(2), true);
            approve(staff, id).andExpect(status().isOk());
            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("approved");
            mvc.perform(get(Routes.Flatmates.FEED).param("tab", "move-in").param("locality", "Baner"))
                    .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]", Matchers.hasSize(1)));
        }

        @Test
        @DisplayName("un-ticking a check blocks publication again")
        void untickBlocks() throws Exception {
            User author = host("9814000003");
            User staff = desk("9814000004");
            String id = createRoom(author, "Baner");
            FlatmateDeskTicks.tickAll(mvc, bearer(staff), id);
            FlatmateDeskTicks.tick(mvc, bearer(staff), id, FlatmateDeskTicks.CHECKS.get(1), false);

            approve(staff, id).andExpect(status().isConflict());
        }

        @Test
        @DisplayName("seeker posts and hunting groups are live first, with no ticks and no case file")
        void seekersAndHuntingGroupsAreLiveFirst() throws Exception {
            User author = host("9814000007");
            User hunter = host("9814000008");
            String post = createPost(author, "Baner");
            String group = createHuntingGroup(hunter, "Baner");

            assertThat(modStatusOf("flatmate_seeker_posts", post)).isEqualTo("live");
            assertThat(modStatusOf("flatmate_groups", group)).isEqualTo("live");
            assertThat(jdbc.queryForObject(
                    "select count(*) from property_reviews where flatmate_post_id in (?::uuid, ?::uuid)",
                    Integer.class, post, group)).isZero();
        }

        @Test
        @DisplayName("a live post can be hidden or removed without ticks, and the queue says which kinds need them")
        void hideAndRemoveNeedNoTicks() throws Exception {
            User author = host("9814000009");
            User staff = desk("9814000010");
            String post = createPost(author, "Baner");

            moderate(staff, post, "{\"modStatus\":\"removed\",\"note\":\"spam\"}").andExpect(status().isOk());
            assertThat(modStatusOf("flatmate_seeker_posts", post)).isEqualTo("removed");

            String room = createRoom(host("9814000011"), "Baner");
            mvc.perform(get(Routes.Moderation.FLATMATE_MODERATION_QUEUE)
                            .param("kind", "post,room").param("modStatus", "pending,removed")
                            .param("size", "200")
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                    .andExpect(jsonPath("$.content[?(@.id == '" + room + "')].checklistRequired",
                            Matchers.contains(true)))
                    .andExpect(jsonPath("$.content[?(@.id == '" + post + "')].checklistRequired",
                            Matchers.contains(false)));
        }

        @Test
        @DisplayName("staff cannot tick a post they own")
        void selfTickIsForbidden() throws Exception {
            User staff = host("9814000012");
            String id = createRoom(staff, "Baner");
            jdbc.update("update users set role = 'admin' where id = ?", staff.getId());

            mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_CHECKLIST, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"item\":\"" + FlatmateDeskTicks.CHECKS.get(0) + "\",\"pass\":true}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a host cannot tick their own checks")
        void hostTickIsForbidden() throws Exception {
            User author = host("9814000013");
            String id = createRoom(author, "Baner");

            mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_CHECKLIST, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(author))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"item\":\"" + FlatmateDeskTicks.CHECKS.get(0) + "\",\"pass\":true}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("an unknown check is a 404")
        void unknownCheck() throws Exception {
            User staff = desk("9814000014");
            String id = createRoom(host("9814000015"), "Baner");

            mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_CHECKLIST, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"item\":\"Made up\",\"pass\":true}"))
                    .andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("Needs info — the post stays pending and the host is told in the Support thread")
    class NeedsInfo {
        @Test
        @DisplayName("it keeps the post pending, takes a reason code and posts into the thread")
        void keepsPendingAndPosts() throws Exception {
            User author = host("9814000020");
            User staff = desk("9814000021");
            String id = createRoom(author, "Baner");

            needsInfo(staff, id, "\"photos_not_real\"", "null").andExpect(status().isOk());

            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("pending");
            thread(author, "room", id).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("needs_info"))
                    .andExpect(jsonPath("$.reasonCode").value("photos_not_real"))
                    .andExpect(jsonPath("$.messages.length()").value(1))
                    .andExpect(jsonPath("$.messages[0].from").value("ops"))
                    .andExpect(jsonPath("$.messages[0].body").value(Matchers.containsString("clear photos")))
                    .andExpect(jsonPath("$.messages[0].clarificationRequested").value(true));
            assertThat(jdbc.queryForObject(
                    "select count(*) from notifications where user_id = ?::uuid "
                            + "and type = 'flatmate.moderated.needs_info'",
                    Integer.class, author.getId().toString())).isEqualTo(1);
        }

        @Test
        @DisplayName("a reason code is required, must be known, and 'other' needs a note")
        void validatesTheReason() throws Exception {
            User author = host("9814000022");
            User staff = desk("9814000023");
            String id = createRoom(author, "Baner");

            needsInfo(staff, id, "null", "null").andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("reason_code_required"));
            needsInfo(staff, id, "\"nonsense\"", "null").andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("invalid_reason_code"));
            needsInfo(staff, id, "\"other\"", "null").andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("reason_note_required"));
            needsInfo(staff, id, "\"other\"", "\"Which gate is the flat behind?\"").andExpect(status().isOk());
            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("pending");
        }

        @Test
        @DisplayName("it applies only to a pending post")
        void onlyWhenPending() throws Exception {
            User author = host("9814000024");
            User staff = desk("9814000025");
            String post = createPost(author, "Baner");
            String room = createRoom(host("9814000026"), "Baner");
            FlatmateDeskTicks.tickAll(mvc, bearer(staff), room);
            approve(staff, room).andExpect(status().isOk());

            needsInfo(staff, post, "\"wrong_details\"", "null").andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("needs_info_not_pending"));
            needsInfo(staff, room, "\"wrong_details\"", "null").andExpect(status().isConflict());
        }

        @Test
        @DisplayName("a needs-info post still cannot be published without the ticks")
        void stillNeedsTicks() throws Exception {
            User author = host("9814000027");
            User staff = desk("9814000028");
            String id = createRoom(author, "Baner");
            needsInfo(staff, id, "\"wrong_details\"", "null").andExpect(status().isOk());

            approve(staff, id).andExpect(status().isConflict());
        }

        @Test
        @DisplayName("a removal with a reason code lands in the thread as a rejection")
        void rejectionReachesTheThread() throws Exception {
            User author = host("9814000029");
            User staff = desk("9814000030");
            String id = createRoom(author, "Baner");

            moderate(staff, id, "{\"modStatus\":\"removed\",\"reasonCode\":\"duplicate\"}")
                    .andExpect(status().isOk());

            thread(author, "room", id)
                    .andExpect(jsonPath("$.status").value("rejected"))
                    .andExpect(jsonPath("$.reasonCode").value("duplicate"))
                    .andExpect(jsonPath("$.messages[0].body").value(Matchers.containsString("taken down")));
        }

        @Test
        @DisplayName("a note-only removal still closes the thread as a rejection")
        void noteOnlyRejectionReachesTheThread() throws Exception {
            User author = host("9814000031");
            User staff = desk("9814000032");
            String id = createRoom(author, "Baner");

            moderate(staff, id, "{\"modStatus\":\"removed\",\"note\":\"Listed twice\"}")
                    .andExpect(status().isOk());

            thread(author, "room", id)
                    .andExpect(jsonPath("$.status").value("rejected"))
                    .andExpect(jsonPath("$.reasonCode").value("other"))
                    .andExpect(jsonPath("$.messages[0].body").value(Matchers.containsString("Listed twice")));
        }
    }

    @Nested
    @DisplayName("the Support thread — host replies, unread counts and privacy")
    class SupportThread {
        @Test
        @DisplayName("unread counts follow the message and clear once the host reads the thread")
        void unreadForTheHost() throws Exception {
            User author = host("9814000040");
            User staff = desk("9814000041");
            String id = createRoom(author, "Baner");
            needsInfo(staff, id, "\"locality_unclear\"", "null").andExpect(status().isOk());

            mvc.perform(get(Routes.Flatmates.MY_REVIEWS).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')].unread", Matchers.contains(1)))
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')].kind", Matchers.contains("room")))
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')].status", Matchers.contains("needs_info")));

            mvc.perform(post(Routes.Flatmates.CASE_READ, "room", id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(author)))
                    .andExpect(status().isNoContent());

            mvc.perform(get(Routes.Flatmates.MY_REVIEWS).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')].unread", Matchers.contains(0)));
        }

        @Test
        @DisplayName("a host reply reopens the case, counts for the desk, and clears when the desk acts")
        void hostReplyReopens() throws Exception {
            User author = host("9814000042");
            User staff = desk("9814000043");
            String id = createRoom(author, "Baner");
            needsInfo(staff, id, "\"wrong_details\"", "null").andExpect(status().isOk());

            reply(author, "room", id, "Corrected the rent and added the society name.")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("in_review"))
                    .andExpect(jsonPath("$.messages.length()").value(2))
                    .andExpect(jsonPath("$.messages[1].from").value("owner"));
            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("pending");

            mvc.perform(get(Routes.Moderation.FLATMATE_MODERATION_QUEUE)
                            .param("kind", "room").param("modStatus", "pending").param("size", "200")
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                    .andExpect(jsonPath("$.content[?(@.id == '" + id + "')].unreadFromHost",
                            Matchers.contains(1)))
                    .andExpect(jsonPath("$.content[?(@.id == '" + id + "')].caseStatus",
                            Matchers.contains("in_review")));

            FlatmateDeskTicks.tickAll(mvc, bearer(staff), id);
            approve(staff, id).andExpect(status().isOk());

            mvc.perform(get(Routes.Moderation.FLATMATE_MODERATION_DETAIL, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                    .andExpect(jsonPath("$.caseFile.status").value("approved"))
                    .andExpect(jsonPath("$.caseFile.checklist[*].pass", Matchers.everyItem(Matchers.is(true))));
            mvc.perform(get(Routes.Flatmates.MY_REVIEWS).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')].status", Matchers.contains("approved")));
        }

        @Test
        @DisplayName("an empty or oversized reply is rejected")
        void replyIsValidated() throws Exception {
            User author = host("9814000044");
            String id = createRoom(author, "Baner");

            reply(author, "room", id, " ").andExpect(status().isUnprocessableEntity());
            reply(author, "room", id, "x".repeat(2001)).andExpect(status().isUnprocessableEntity());
        }

        @Test
        @DisplayName("only the host can read or write the thread; anyone else gets a 404")
        void strangersGetNothing() throws Exception {
            User author = host("9814000045");
            User stranger = host("9814000046");
            User staff = desk("9814000047");
            String id = createRoom(author, "Baner");
            needsInfo(staff, id, "\"wrong_details\"", "null").andExpect(status().isOk());

            thread(stranger, "room", id).andExpect(status().isNotFound());
            reply(stranger, "room", id, "hello").andExpect(status().isNotFound());
            mvc.perform(post(Routes.Flatmates.CASE_READ, "room", id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                    .andExpect(status().isNotFound());
            thread(author, "banana", id).andExpect(status().isNotFound());
            thread(author, "room", UUID.randomUUID().toString()).andExpect(status().isNotFound());
            mvc.perform(get(Routes.Flatmates.CASE, "room", id)).andExpect(status().isUnauthorized());
            mvc.perform(get(Routes.Flatmates.MY_REVIEWS).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                    .andExpect(jsonPath("$[?(@.id == '" + id + "')]", Matchers.hasSize(0)));
        }

        @Test
        @DisplayName("a host without a case file reads an empty in-review thread with the three checks unticked")
        void freshThread() throws Exception {
            User author = host("9814000048");
            String id = createRoom(author, "Baner");

            thread(author, "room", id).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("in_review"))
                    .andExpect(jsonPath("$.messages").isEmpty())
                    .andExpect(jsonPath("$.checklist.length()").value(3));
        }

        @Test
        @DisplayName("a host edit that sends a live room back to review resets the ticks")
        void editResetsTheTicks() throws Exception {
            User author = host("9814000049");
            User staff = desk("9814000050");
            String id = createRoom(author, "Baner");
            FlatmateDeskTicks.tickAll(mvc, bearer(staff), id);
            approve(staff, id).andExpect(status().isOk());

            mvc.perform(patch(Routes.Flatmates.ROOM_BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(author))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(roomBody(author, "Aundh")))
                    .andExpect(status().isOk());

            assertThat(modStatusOf("flatmate_rooms", id)).isEqualTo("pending");
            thread(author, "room", id)
                    .andExpect(jsonPath("$.status").value("in_review"))
                    .andExpect(jsonPath("$.checklist[*].pass", Matchers.everyItem(Matchers.is(false))));
            approve(staff, id).andExpect(status().isConflict());
        }
    }

    @Nested
    @DisplayName("verifiedOnly keeps Verified property rooms and ID-verified people")
    class VerifiedOnly {
        private int feedHits(String tab, String locality, String id) throws Exception {
            String json = mvc.perform(get(Routes.Flatmates.FEED).param("tab", tab)
                            .param("locality", locality).param("verifiedOnly", "true").param("size", "100"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            return json.contains(id) ? 1 : 0;
        }

        @Test
        @DisplayName("a tenant room counts only once its agreement review is approved")
        void tenantRoomNeedsAnApprovedReview() throws Exception {
            User staff = desk("9814000060");
            User plainHost = host("9814000061");
            User tenantHost = host("9814000062");
            String plain = createRoom(plainHost, "Baner");
            String tenant = createRoom(tenantHost, "Baner");
            for (String id : List.of(plain, tenant)) {
                FlatmateDeskTicks.tickAll(mvc, bearer(staff), id);
                approve(staff, id).andExpect(status().isOk());
            }
            jdbc.update("update flatmate_rooms set verification_tier = 'tenant' where id = ?::uuid", tenant);
            jdbc.update("insert into flatmate_reviews (kind, room_id, host_id, tier, status) "
                    + "values ('room', ?::uuid, ?, 'tenant', 'pending')", tenant, tenantHost.getId());

            assertThat(feedHits("move-in", "Baner", tenant)).isZero();

            jdbc.update("update flatmate_reviews set status = 'approved' where room_id = ?::uuid", tenant);

            assertThat(feedHits("move-in", "Baner", tenant)).isOne();
            assertThat(feedHits("move-in", "Baner", plain)).isZero();
        }

        @Test
        @DisplayName("a hunting group counts when every member is ID verified, and a seeker when their ID is")
        void peopleNeedAnIdBadge() throws Exception {
            User verifiedLead = host("9814000063");
            User plainLead = host("9814000064");
            String verifiedGroup = createHuntingGroup(verifiedLead, "Baner");
            String plainGroup = createHuntingGroup(plainLead, "Baner");
            jdbc.update("update flatmate_groups set mod_status = 'live' where id in (?::uuid, ?::uuid)",
                    verifiedGroup, plainGroup);
            jdbc.update("update flatmate_group_members set verified = true where group_id = ?::uuid",
                    verifiedGroup);
            jdbc.update("update flatmate_group_members set verified = false where group_id = ?::uuid",
                    plainGroup);

            assertThat(feedHits("team-up", "Baner", verifiedGroup)).isOne();
            assertThat(feedHits("team-up", "Baner", plainGroup)).isZero();
        }
    }

    @Nested
    @DisplayName("data migration — inline agreement bytes are dropped, the vault reference stays")
    class Migration {
        @Test
        @DisplayName("strips dataUrl from old agreement docs and leaves the rest untouched")
        void stripsInlineBytes() throws Exception {
            User author = host("9814000070");
            String id = createRoom(author, "Baner");
            jdbc.update("insert into flatmate_reviews (kind, room_id, host_id, tier, status, agreement_doc) "
                            + "values ('room', ?::uuid, ?, 'tenant', 'pending', "
                            + "'{\"name\":\"a.pdf\",\"dataUrl\":\"data:application/pdf;base64,AAAA\"}'::jsonb)",
                    id, author.getId());

            String sql = new ClassPathResource(
                    "db/migration/26.11.21__DML_flatmate_strip_inline_agreement_bytes.sql")
                    .getContentAsString(StandardCharsets.UTF_8);
            jdbc.execute(sql);

            assertThat(jdbc.queryForObject(
                    "select agreement_doc::text from flatmate_reviews where room_id = ?::uuid",
                    String.class, id))
                    .contains("a.pdf").doesNotContain("dataUrl");
        }
    }
}
