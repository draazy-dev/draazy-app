package com.draazy.api.catalog.managed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Managed property — manual rent receipts")
class ManagedRentReceiptTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    ManagedPropertyRepository managed;

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String MONTH_1 = YearMonth.now(IST).minusMonths(1).toString();
    private static final String MONTH_2 = YearMonth.now(IST).minusMonths(2).toString();
    private static final String MONTH_3 = YearMonth.now(IST).minusMonths(3).toString();

    private User owner(String mobile, String name) {
        User u = new User(mobile, "owner");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String register(User o, String body) throws Exception {
        String json = mvc.perform(post(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    private void patchProperty(User o, String id, String body) throws Exception {
        mvc.perform(patch(Routes.MeManagedProperties.BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private String rentedFlat(User o) throws Exception {
        String id = register(o, "{\"deal\":\"rent\",\"propertyType\":\"Flat\",\"bhk\":2,"
                + "\"price\":26000,\"locality\":\"Baner\",\"societyId\":\"" + societyNamed("Vista Heights") + "\"}");
        patchProperty(o, id, "{\"rented\":true,\"tenantName\":\"Rohit Kulkarni\",\"tenantMobile\":\"9123456780\","
                + "\"monthlyRent\":26000}");
        return id;
    }

    private void forceRentState(String id, String tenantName, Long monthlyRent) {
        ManagedProperty m = managed.findById(UUID.fromString(id)).orElseThrow();
        m.setRented(true);
        m.setTenantName(tenantName);
        m.setMonthlyRent(monthlyRent);
        managed.saveAndFlush(m);
    }

    private static String receipts(String id) {
        return Routes.MeManagedProperties.BASE + "/" + id + "/rent-receipts";
    }

    private String recordMonth(User o, String id, String month) throws Exception {
        return mvc.perform(post(receipts(id))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + month + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("the server composes amount, tenant, landlord and address — the client sends only a month")
    void create_snapshotsFromTheOwnedProperty() throws Exception {
        User o = owner("9861004001", "Asha Patil");
        String id = rentedFlat(o);

        mvc.perform(post(receipts(id))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\",\"amount\":1,"
                                + "\"tenantName\":\"Someone Else\",\"landlordName\":\"Not Asha\","
                                + "\"propertyAddress\":\"Elsewhere\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rentMonth").value(MONTH_2))
                .andExpect(jsonPath("$.amount").value(26000))
                .andExpect(jsonPath("$.tenantName").value("Rohit Kulkarni"))
                .andExpect(jsonPath("$.landlordName").value("Asha Patil"))
                .andExpect(jsonPath("$.propertyAddress").value("Vista Heights, Baner, Pune"))
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    @DisplayName("the snapshot survives the property changing underneath it")
    void snapshot_isImmutableOnceWritten() throws Exception {
        User o = owner("9861004002", "Asha Patil");
        String id = rentedFlat(o);
        recordMonth(o, id, MONTH_2);

        patchProperty(o, id, "{\"tenantName\":\"Neha Shah\",\"monthlyRent\":31000}");

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].tenantName").value("Rohit Kulkarni"))
                .andExpect(jsonPath("$[0].amount").value(26000));

        mvc.perform(get(Routes.MeManagedProperties.BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.tenantName").value("Neha Shah"))
                .andExpect(jsonPath("$.monthlyRent").value(31000));
    }

    @Test
    @DisplayName("the receipt id is durable — the same id comes back on a later read")
    void receiptId_isStableAcrossReads() throws Exception {
        User o = owner("9861004003", "Asha Patil");
        String id = rentedFlat(o);
        String created = recordMonth(o, id, MONTH_2);
        String receiptId = created.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");

        assertThat(receiptId).isNotBlank();
        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$[0].id").value(receiptId));
    }

    @Test
    @DisplayName("a foreign id and an unknown id are the same 404, on both read and write")
    void ownership_foreignAndUnknownAreIndistinguishable() throws Exception {
        User o = owner("9861004010", "Asha Patil");
        User stranger = owner("9861004011", "Vikram Rao");
        String id = rentedFlat(o);
        recordMonth(o, id, MONTH_2);
        String unknown = UUID.randomUUID().toString();

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(get(receipts(unknown)).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(post(receipts(id))
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_1 + "\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post(receipts(unknown))
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_1 + "\"}"))
                .andExpect(status().isNotFound());

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("no token, no receipts")
    void anonymous_isRejected() throws Exception {
        User o = owner("9861004012", "Asha Patil");
        String id = rentedFlat(o);

        mvc.perform(get(receipts(id))).andExpect(status().isUnauthorized());
        mvc.perform(post(receipts(id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a property that is not rented, has no rent, or has no tenant cannot issue a receipt")
    void create_requiresARentableParent() throws Exception {
        User o = owner("9861004020", "Asha Patil");

        String notRented = register(o, "{\"deal\":\"rent\",\"propertyType\":\"Flat\",\"bhk\":2,"
                + "\"price\":26000,\"locality\":\"Baner\"}");
        mvc.perform(post(receipts(notRented))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isUnprocessableEntity());

        String noTenant = register(o, "{\"deal\":\"rent\",\"propertyType\":\"Flat\",\"bhk\":2,"
                + "\"price\":26000,\"locality\":\"Baner\"}");
        forceRentState(noTenant, null, 26000L);
        mvc.perform(post(receipts(noTenant))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isUnprocessableEntity());

        String noRent = register(o, "{\"deal\":\"buy\",\"propertyType\":\"Flat\",\"bhk\":2,"
                + "\"price\":9000000,\"locality\":\"Baner\"}");
        forceRentState(noRent, "Rohit Kulkarni", null);
        mvc.perform(post(receipts(noRent))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isUnprocessableEntity());

        patchProperty(o, noRent, "{\"tenantMobile\":\"9123456780\",\"monthlyRent\":26000}");
        mvc.perform(post(receipts(noRent))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a month outside YYYY-MM is a 422, not a row")
    void create_rejectsAMalformedMonth() throws Exception {
        User o = owner("9861004021", "Asha Patil");
        String id = rentedFlat(o);

        for (String bad : new String[] {"2026-13", "2026-00", "26-03", "2026-3", "March 2026", ""}) {
            mvc.perform(post(receipts(id))
                            .header(HttpHeaders.AUTHORIZATION, bearer(o))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"rentMonth\":\"" + bad + "\"}"))
                    .andExpect(status().isUnprocessableEntity());
        }

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("a well-formed month can still be out of range: no future, nothing older than five years")
    void create_rejectsAMonthOutsideTheWindow() throws Exception {
        User o = owner("9861004022", "Asha Patil");
        String id = rentedFlat(o);
        YearMonth now = YearMonth.now(IST);

        String[] outOfRange = {
            now.plusMonths(1).toString(),
            now.plusYears(3).toString(),
            now.minusYears(5).minusMonths(1).toString(),
            "0001-01",
        };
        for (String bad : outOfRange) {
            mvc.perform(post(receipts(id))
                            .header(HttpHeaders.AUTHORIZATION, bearer(o))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"rentMonth\":\"" + bad + "\"}"))
                    .andExpect(status().isUnprocessableEntity());
        }

        recordMonth(o, id, now.minusMonths(1).toString());
        recordMonth(o, id, now.minusYears(5).toString());
        mvc.perform(get(receipts(id)).param("months", "24")
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    @DisplayName("the second attempt at the same month is a 409 and leaves the first receipt untouched")
    void create_isOneReceiptPerMonth() throws Exception {
        User o = owner("9861004030", "Asha Patil");
        String id = rentedFlat(o);
        String first = recordMonth(o, id, MONTH_2);
        String firstReceiptId = first.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");

        mvc.perform(post(receipts(id))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_2 + "\"}"))
                .andExpect(status().isConflict());

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(firstReceiptId));

        mvc.perform(post(receipts(id))
                        .header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + MONTH_1 + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("the same month on two different properties is two receipts, not a conflict")
    void monthUniqueness_isPerProperty() throws Exception {
        User o = owner("9861004031", "Asha Patil");
        String one = rentedFlat(o);
        String two = rentedFlat(o);

        recordMonth(o, one, MONTH_2);
        recordMonth(o, two, MONTH_2);

        mvc.perform(get(receipts(one)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(receipts(two)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("newest month first, and months is a window not a filter")
    void list_isNewestFirstAndWindowed() throws Exception {
        User o = owner("9861004040", "Asha Patil");
        String id = rentedFlat(o);
        recordMonth(o, id, MONTH_3);
        recordMonth(o, id, MONTH_1);
        recordMonth(o, id, MONTH_2);

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].rentMonth").value(MONTH_1))
                .andExpect(jsonPath("$[2].rentMonth").value(MONTH_3));

        mvc.perform(get(receipts(id)).param("months", "2")
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].rentMonth").value(MONTH_1));

        mvc.perform(get(receipts(id)).param("months", "0")
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(receipts(id)).param("months", "9999")
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    @DisplayName("a property with no receipts reads as an empty list, not a 404")
    void list_isEmptyBeforeAnythingIsRecorded() throws Exception {
        User o = owner("9861004041", "Asha Patil");
        String id = rentedFlat(o);

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("deleting the property deletes its receipts")
    void delete_cascadesToReceipts() throws Exception {
        User o = owner("9861004050", "Asha Patil");
        String id = rentedFlat(o);
        recordMonth(o, id, MONTH_2);

        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(delete(Routes.MeManagedProperties.BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isNoContent());

        assertThat(managed.findById(UUID.fromString(id))).isEmpty();
        mvc.perform(get(receipts(id)).header(HttpHeaders.AUTHORIZATION, bearer(o)))
                .andExpect(status().isNotFound());
    }
}
