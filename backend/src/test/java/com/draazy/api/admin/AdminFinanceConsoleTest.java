package com.draazy.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

/** The database is shared and the book may grow, so each test inserts its own rows and asserts deltas. */
@DisplayName("/admin/finance — the console's three reads")
class AdminFinanceConsoleTest extends AbstractApiTest {

    private static final long OWNER_PRO_PRICE = 2499L;

    private static final long OWNER_PRO_MONTHLY = 208L;

    private static final long SEEKER_PLUS_PRICE = 199L;

    @Autowired UserRepository users;

    private String bearerFor(String mobile, String role, String name) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        return bearer(users.saveAndFlush(u));
    }

    private String admin() {
        return bearerFor("9877730001", Roles.Wire.ADMIN, "Console admin");
    }

    private UUID member(String mobile, String name) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u).getId();
    }

    private UUID subscribe(String mobile, String displayName, String planName, String status) {
        UUID userId = member(mobile, displayName);
        return jdbc.queryForObject("""
                insert into subscriptions (user_id, plan_id, status, started_at, payment_ref, amount)
                select ?, p.id, ?, now(), ?, p.price from plans p where p.name = ?
                returning id
                """, UUID.class, userId, status, "pay_" + mobile, planName);
    }

    /** Stands in for the payment webhook, which issues the invoice; returns its number. */
    private String invoice(UUID userId, String sourceType, long amount, long fee, Instant issuedAt) {
        String number = "TST-INV-" + UUID.randomUUID();
        jdbc.update("""
                insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """, number, userId, sourceType, UUID.randomUUID(), amount, fee, Timestamp.from(issuedAt));
        return number;
    }

    private String creditNote(UUID userId, String sourceType, long amount, long fee) {
        String number = "TST-CN-" + UUID.randomUUID();
        jdbc.update("""
                insert into credit_notes (number, user_id, source_type, source_id, amount, taxable_amount)
                values (?, ?, ?, ?, ?, ?)
                """, number, userId, sourceType, UUID.randomUUID(), amount, fee);
        return number;
    }

    private String body(String url, String token) throws Exception {
        return mvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private static long num(String json, String path) {
        return ((Number) JsonPath.read(json, path)).longValue();
    }

    private static long delta(String before, String after, String path) {
        return num(after, path) - num(before, path);
    }

    @Nested
    @DisplayName("the subscription book")
    class Book {

        @Test
        void aYearlyPlanContributesATwelfthOfItsPriceToMrr() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            subscribe("9877730010", "Yearly Member", "Owner Pro", "active");

            assertThat(delta(before, body(Routes.Admin.FINANCE, token), "$.mrr"))
                    .as("one Owner Pro at ₹%d a year is ₹%d a month", OWNER_PRO_PRICE, OWNER_PRO_MONTHLY)
                    .isEqualTo(OWNER_PRO_MONTHLY);
        }

        @Test
        void aMonthlyPlanContributesItsWholePrice() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            subscribe("9877730011", "Monthly Member", "Seeker Plus", "active");

            assertThat(delta(before, body(Routes.Admin.FINANCE, token), "$.mrr")).isEqualTo(SEEKER_PLUS_PRICE);
        }

        @Test
        void aCancelledOrFreeSubscriptionBillsNothingNextMonth() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            subscribe("9877730012", "Cancelled Member", "Owner Pro", "cancelled");
            subscribe("9877730013", "Free Member", "Owner Free", "active");

            assertThat(delta(before, body(Routes.Admin.FINANCE, token), "$.mrr")).isZero();
        }

        @Test
        void thePlanLinesSumToMrrAndCarryTheStickerPrice() throws Exception {
            String token = admin();
            subscribe("9877730014", "Book Member", "Owner Pro", "active");
            subscribe("9877730015", "Pass Member", "Listing Pass", "active");

            String json = body(Routes.Admin.FINANCE, token);
            List<Map<String, Object>> plans = JsonPath.read(json, "$.plans");
            assertThat(plans.stream().mapToLong(p -> ((Number) p.get("monthlyValue")).longValue()).sum())
                    .isEqualTo(num(json, "$.mrr"));
            assertThat(plans).anySatisfy(p -> {
                assertThat(p.get("name")).isEqualTo("Owner Pro");
                assertThat(((Number) p.get("price")).longValue()).isEqualTo(OWNER_PRO_PRICE);
                assertThat(p).containsEntry("termDays", null);
            });
            assertThat(plans).anySatisfy(p -> {
                assertThat(p.get("name")).isEqualTo("Listing Pass");
                assertThat(((Number) p.get("termDays")).intValue()).isEqualTo(60);
            });
        }

        @Test
        void aPaidSubscriptionWithoutAnInvoiceIsNotMoney() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            subscribe("9877730016", "Uninvoiced Member", "Owner Pro", "active");

            assertThat(delta(before, body(Routes.Admin.FINANCE, token), "$.month.collected"))
                    .as("money is what the gateway confirmed, and only that issues an invoice")
                    .isZero();
        }
    }

    @Nested
    @DisplayName("this month's money")
    class Money {

        @Test
        void aSubscriptionInvoiceIsCollectedAndAllFee() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            invoice(member("9877730020", "Invoice Member"), "subscription", 999, 999, Instant.now());

            String after = body(Routes.Admin.FINANCE, token);
            assertThat(delta(before, after, "$.month.collected")).isEqualTo(999);
            assertThat(delta(before, after, "$.month.net")).isEqualTo(999);
            assertThat(delta(before, after, "$.month.passThrough")).isZero();
            assertThat(delta(before, after, "$.month.payments")).isEqualTo(1);
        }

        @Test
        void stampDutyInAServicePaymentIsPassThroughNotRevenue() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            invoice(member("9877730021", "Agreement Member"), "service_request", 5000, 999, Instant.now());

            String after = body(Routes.Admin.FINANCE, token);
            assertThat(delta(before, after, "$.month.collected")).isEqualTo(5000);
            assertThat(delta(before, after, "$.month.passThrough")).isEqualTo(4001);
            assertThat(delta(before, after, "$.month.net")).isEqualTo(999);
        }

        @Test
        void aCreditNoteIsRefundedAndTakesItsFeeOutOfNet() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            UUID payer = member("9877730022", "Refunded Member");
            invoice(payer, "service_request", 5000, 999, Instant.now());
            creditNote(payer, "service_request_refund", 4001, 0);

            String after = body(Routes.Admin.FINANCE, token);
            assertThat(delta(before, after, "$.month.refunded")).isEqualTo(4001);
            assertThat(delta(before, after, "$.month.passThrough")).as("the duty went back").isZero();
            assertThat(delta(before, after, "$.month.net")).isEqualTo(999);
            assertThat(num(after, "$.month.collected") - num(after, "$.month.refunded")
                    - num(after, "$.month.passThrough"))
                    .as("the breakdown reconciles")
                    .isEqualTo(num(after, "$.month.net"));
        }

        @Test
        void anInvoiceFromLastMonthIsNotThisMonths() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            Instant lastMonth = LocalDate.now(PlatformTime.IST).withDayOfMonth(1).minusDays(1)
                    .atStartOfDay(PlatformTime.IST).toInstant();
            invoice(member("9877730023", "Old Invoice Member"), "subscription", 999, 999, lastMonth);

            assertThat(delta(before, body(Routes.Admin.FINANCE, token), "$.month.collected")).isZero();
        }

        @Test
        void anOpenDisputeAndAPendingRefundNeedAttention() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE, token);

            UUID order = subscribe("9877730024", "Disputing Member", "Owner Pro", "active");
            UUID userId = jdbc.queryForObject("select user_id from subscriptions where id = ?", UUID.class, order);
            jdbc.update("""
                    insert into payment_disputes (dispute_ref, order_ref, user_id, subscription_id, amount)
                    values (?, 'pay_9877730024', ?, ?, 2499)
                    """, "TST-DSP-" + UUID.randomUUID(), userId, order);
            jdbc.update("""
                    insert into refund_requests (user_id, subscription_id, kind, basis, amount, idempotency_key)
                    values (?, ?, 'contact_pack', 'pack_unused', 2499, ?)
                    """, userId, order, UUID.randomUUID().toString());

            String after = body(Routes.Admin.FINANCE, token);
            assertThat(delta(before, after, "$.attention.openDisputes")).isEqualTo(1);
            assertThat(delta(before, after, "$.attention.openDisputeAmount")).isEqualTo(2499);
            assertThat(delta(before, after, "$.attention.refundRequests")).isEqualTo(1);
            assertThat(delta(before, after, "$.attention.refundRequestAmount")).isEqualTo(2499);
        }
    }

    @Nested
    @DisplayName("the monthly series")
    class Series {

        @Test
        void everyMonthInTheWindowIsReturnedIncludingEmptyOnes() throws Exception {
            String json = body(Routes.Admin.FINANCE_SERIES + "?months=6", admin());

            assertThat(JsonPath.<List<Object>>read(json, "$")).hasSize(6);
            List<String> months = JsonPath.read(json, "$[*].month");
            assertThat(months)
                    .as("oldest first, and the last bucket is the month we are in")
                    .isSorted()
                    .last().isEqualTo(LocalDate.now(PlatformTime.IST).withDayOfMonth(1).toString());
        }

        @Test
        void eachSourceLandsInItsOwnBandAndTheMonthAgreesWithTheOverview() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.FINANCE_SERIES + "?months=1", token);

            UUID payer = member("9877730030", "Band Member");
            invoice(payer, "subscription", 999, 999, Instant.now());
            invoice(payer, "service_request_amendment", 3000, 0, Instant.now());
            invoice(payer, "service_request", 4000, 1499, Instant.now());
            creditNote(payer, "subscription", 999, 999);

            String series = body(Routes.Admin.FINANCE_SERIES + "?months=1", token);
            assertThat(delta(before, series, "$[0].subscriptions")).isEqualTo(999);
            assertThat(delta(before, series, "$[0].services")).as("fees only, never the duty").isEqualTo(1499);
            assertThat(delta(before, series, "$[0].refunds")).isEqualTo(999);
            assertThat(num(series, "$[0].subscriptions") + num(series, "$[0].services") - num(series, "$[0].refunds"))
                    .as("the chart and the headline tile describe the same month")
                    .isEqualTo(num(body(Routes.Admin.FINANCE, token), "$.month.net"));
        }

        @Test
        void aWindowOutsideTheAllowedRangeIsRefused() throws Exception {
            String token = admin();
            for (String months : List.of("0", "61", "-1")) {
                mvc.perform(get(Routes.Admin.FINANCE_SERIES + "?months=" + months)
                                .header(HttpHeaders.AUTHORIZATION, token))
                        .andExpect(status().isBadRequest());
            }
        }
    }

    @Nested
    @DisplayName("the ledger")
    class Ledger {

        @Test
        void anInvoiceIsARowFindableByPartyOrNumber() throws Exception {
            String token = admin();
            String number = invoice(member("9877730040", "Ledger Member"), "service_request", 5000, 999,
                    Instant.now());

            for (String q : List.of("Ledger Member", number)) {
                mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", q)
                                .header(HttpHeaders.AUTHORIZATION, token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.totalElements").value(1))
                        .andExpect(jsonPath("$.content[0].number").value(number))
                        .andExpect(jsonPath("$.content[0].party").value("Ledger Member"))
                        .andExpect(jsonPath("$.content[0].kind").value("service"))
                        .andExpect(jsonPath("$.content[0].amount").value(5000))
                        .andExpect(jsonPath("$.content[0].fee").value(999));
            }
        }

        @Test
        void aCreditNoteIsANegativeRefundRow() throws Exception {
            String token = admin();
            UUID payer = member("9877730041", "Refund Row Member");
            invoice(payer, "subscription", 999, 999, Instant.now());
            String note = creditNote(payer, "subscription", 999, 999);

            mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", "Refund Row Member").param("kind", "refund")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].number").value(note))
                    .andExpect(jsonPath("$.content[0].amount").value(-999))
                    .andExpect(jsonPath("$.content[0].fee").value(-999));
            mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", "Refund Row Member")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(jsonPath("$.totalElements").value(2));
        }

        @Test
        void daysKeepsOnlyDocumentsIssuedWithinTheIstWindow() throws Exception {
            String token = admin();
            invoice(member("9877730042", "Window Fresh Member"), "subscription", 999, 999, Instant.now());
            invoice(member("9877730043", "Window Stale Member"), "subscription", 999, 999,
                    LocalDate.now(PlatformTime.IST).atStartOfDay(PlatformTime.IST).toInstant()
                            .minus(1, ChronoUnit.MINUTES));

            mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", "Window ").param("days", "1")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].party").value("Window Fresh Member"));
            mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", "Window ").param("days", "7")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(jsonPath("$.totalElements").value(2));
        }

        @Test
        void anUnpaidCheckoutIsNotALedgerRow() throws Exception {
            String token = admin();
            subscribe("9877730044", "Checkout Member", "Owner Pro", "pending");

            mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("q", "Checkout Member")
                            .header(HttpHeaders.AUTHORIZATION, token))
                    .andExpect(jsonPath("$.totalElements").value(0));
        }

        @Test
        void onlyTheThreeKindsAreAccepted() throws Exception {
            String token = admin();
            for (String kind : List.of("subscription", "service", "refund")) {
                mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("kind", kind)
                                .header(HttpHeaders.AUTHORIZATION, token))
                        .andExpect(status().isOk());
            }
            for (String kind : List.of("deal", "featured")) {
                mvc.perform(get(Routes.Admin.FINANCE_TRANSACTIONS).param("kind", kind)
                                .header(HttpHeaders.AUTHORIZATION, token))
                        .andExpect(status().isBadRequest());
            }
        }

        @Test
        void noRowCarriesAMobileNumber() throws Exception {
            String token = admin();
            invoice(member("9877730045", "Privacy Member"), "subscription", 999, 999, Instant.now());

            List<String> parties = JsonPath.read(body(Routes.Admin.FINANCE_TRANSACTIONS + "?size=100", token),
                    "$.content[*].party");
            assertThat(parties).isNotEmpty()
                    .noneMatch(p -> p.matches(".*(?<!\\d)(?:\\+91[\\s-]?)?[6-9]\\d{9}(?!\\d).*"));
        }
    }

    @Nested
    @DisplayName("the guard")
    class Guard {

        @Test
        void staffCannotReadAnyOfTheThree() throws Exception {
            String staff = bearerFor("9877730050", Roles.Wire.STAFF, "Ops staff");
            for (String route : List.of(Routes.Admin.FINANCE, Routes.Admin.FINANCE_SERIES,
                    Routes.Admin.FINANCE_TRANSACTIONS)) {
                mvc.perform(get(route).header(HttpHeaders.AUTHORIZATION, staff))
                        .andExpect(status().isForbidden());
            }
        }

        @Test
        void anAdministratorReachesAllThree() throws Exception {
            String token = admin();
            for (String route : List.of(Routes.Admin.FINANCE, Routes.Admin.FINANCE_SERIES,
                    Routes.Admin.FINANCE_TRANSACTIONS)) {
                mvc.perform(get(route).header(HttpHeaders.AUTHORIZATION, token))
                        .andExpect(status().isOk());
            }
        }
    }
}