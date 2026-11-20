package com.draazy.api.admin.leads;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

abstract class LeadsTestBase extends AbstractApiTest {
    static final String LEADS = "/admin/leads";

    @Autowired UserRepository users;

    protected User user(String mobile, String role, String name) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    protected User staff(String mobile, String name) {
        return user(mobile, "staff", name);
    }

    protected User manager(String mobile, String name) {
        return user(mobile, "manager", name);
    }

    protected UUID lead(String mobile, String name, String stage, User owner) {
        return jdbc.queryForObject("""
                insert into crm_leads (mobile, name, stage, owner_id, claimed_at)
                values (?, ?, ?, ?, ?) returning id
                """, UUID.class, mobile, name, stage, owner == null ? null : owner.getId(),
                owner == null ? null : OffsetDateTime.now());
    }

    protected UUID lead(String mobile, String stage, User owner) {
        return lead(mobile, "Lead " + mobile, stage, owner);
    }

    protected ResultActions get(User caller, String url, Object... vars) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(url, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    protected ResultActions post(User caller, String url, String json, Object... vars) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(url, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected ResultActions put(User caller, String url, String json, Object... vars) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.put(url, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected ResultActions patch(User caller, String url, String json, Object... vars) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.patch(url, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected static <T> T read(ResultActions result, String path) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), path);
    }

    protected String stageOf(UUID lead) {
        return jdbc.queryForObject("select stage from crm_leads where id = ?", String.class, lead);
    }

    protected UUID ownerOf(UUID lead) {
        return jdbc.queryForObject("select owner_id from crm_leads where id = ?", UUID.class, lead);
    }

    protected int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    protected String contact(String outcome) {
        return "{\"channel\":\"call\",\"outcome\":\"" + outcome + "\",\"note\":\"tried\"}";
    }

    protected void forgetLastContact(UUID lead) {
        jdbc.update("update crm_leads set last_contact_at = now() - interval '2 days' where id = ?", lead);
    }
}
