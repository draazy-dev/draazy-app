package com.draazy.api.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Refund and contact-return settings: bounds, bootstrap and the grievance officer")
class RefundSettingsEndpointsTest extends AbstractApiTest {

    @Autowired UserRepository users;

    private String admin() {
        User u = new User("9877720001", Roles.Wire.ADMIN);
        u.setName("Settings admin");
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    private ResultActions save(String token, String body) throws Exception {
        return mvc.perform(put(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"fees\":{\"contactReplyDays\":0}}", "{\"fees\":{\"contactReplyDays\":31}}",
            "{\"fees\":{\"contactPendingMax\":0}}", "{\"fees\":{\"contactPendingMax\":101}}",
            "{\"fees\":{\"packRefundDays\":-1}}", "{\"fees\":{\"packRefundDays\":31}}",
            "{\"fees\":{\"passGuaranteeDays\":31}}", "{\"fees\":{\"passGuaranteeMaxEnquiries\":51}}",
            "{\"fees\":{\"passGuaranteeEveryMonths\":0}}", "{\"fees\":{\"passGuaranteeEveryMonths\":37}}",
            "{\"fees\":{\"contactReplyDays\":2.5}}", "{\"fees\":{\"packRefundDays\":\"7\"}}"})
    void outOfBoundsValuesAreRefused(String body) throws Exception {
        save(admin(), body).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("the refund numbers are saved and published on /bootstrap; zero switches a window off")
    void bootstrapPublishesTheRefundNumbers() throws Exception {
        save(admin(), "{\"fees\":{\"contactReplyDays\":3,\"contactPendingMax\":5,\"packRefundDays\":0,"
                + "\"passGuaranteeDays\":14,\"passGuaranteeMaxEnquiries\":2,\"passGuaranteeEveryMonths\":6}}")
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.refunds.contactReplyDays").value(3))
                .andExpect(jsonPath("$.pricing.refunds.packRefundDays").value(0))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeDays").value(14))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeMaxEnquiries").value(2))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeEveryMonths").value(6))
                .andExpect(jsonPath("$.pricing.refunds.contactPendingMax").doesNotExist());
    }

    @Test
    void theDefaultsApplyUntilAdminsChangeThem() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(jsonPath("$.pricing.refunds.contactReplyDays").value(7))
                .andExpect(jsonPath("$.pricing.refunds.packRefundDays").value(7))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeDays").value(7))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeMaxEnquiries").value(0))
                .andExpect(jsonPath("$.pricing.refunds.passGuaranteeEveryMonths").value(12));
    }

    @Test
    void theGrievanceOfficerIsPublishedAndValidated() throws Exception {
        String token = admin();
        save(token, "{\"legal\":{\"grievanceOfficer\":{\"name\":\"A. Kulkarni\",\"email\":\"grievance@draazy.in\"}}}")
                .andExpect(status().isOk());
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(jsonPath("$.legal.grievanceOfficer.name").value("A. Kulkarni"))
                .andExpect(jsonPath("$.legal.grievanceOfficer.email").value("grievance@draazy.in"));

        save(token, "{\"legal\":{\"grievanceOfficer\":{\"name\":\"\",\"email\":\"grievance@draazy.in\"}}}")
                .andExpect(status().isUnprocessableEntity());
        save(token, "{\"legal\":{\"grievanceOfficer\":{\"name\":\"" + "x".repeat(81) + "\",\"email\":\"a@b.in\"}}}")
                .andExpect(status().isUnprocessableEntity());
        save(token, "{\"legal\":{\"grievanceOfficer\":{\"name\":\"A\",\"email\":\"not-an-email\"}}}")
                .andExpect(status().isUnprocessableEntity());
    }
}