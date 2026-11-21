package com.draazy.api.services.request;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TenantPoliceRecordInputTest {

    private static final String MOBILE_PROBLEM =
            "_state.tenants[0].police.occupants[0].mobile must be a 10-digit Indian mobile";

    @ParameterizedTest
    @ValueSource(strings = {"student", "Student", "STUDENT", "home maker", "Home Maker", "homemaker",
            "HOMEMAKER", "home   maker", "housewife", "retired", "Retired person", "full time student"})
    void workplaceNotRequiredForOptionalOccupations(String occupation) {
        assertThat(TenantPoliceRecordRules.requiresWorkplaceSection(Map.of("occupation", occupation))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"engineer", "", "studentship", "unretired", "home"})
    void workplaceRequiredOtherwise(String occupation) {
        assertThat(TenantPoliceRecordRules.requiresWorkplaceSection(Map.of("occupation", occupation))).isTrue();
    }

    @Test
    void workplaceRequiredWhenOccupationMissing() {
        assertThat(TenantPoliceRecordRules.requiresWorkplaceSection(Map.of())).isTrue();
    }

    @Test
    void occupantMobileIsValidatedWhateverItsType() {
        assertThat(occupantProblems("98765 43210")).noneMatch(p -> p.contains(".mobile"));
        assertThat(occupantProblems(9876543210L)).noneMatch(p -> p.contains(".mobile"));
        assertThat(occupantProblems("12345")).contains(MOBILE_PROBLEM);
        assertThat(occupantProblems(12345)).contains(MOBILE_PROBLEM);
    }

    @Test
    void blankOrMissingOccupantMobileIsOnlyReportedAsRequired() {
        for (Object mobile : new Object[] {null, "  "}) {
            List<String> problems = occupantProblems(mobile);
            assertThat(problems).contains("_state.tenants[0].police.occupants[0].mobile is required");
            assertThat(problems).doesNotContain(MOBILE_PROBLEM);
        }
    }

    private static List<String> occupantProblems(Object mobile) {
        Map<String, Object> occupant = new HashMap<>(Map.of(
                "type", "family", "fullName", "Asha", "relation", "spouse", "age", "30"));
        occupant.put("mobile", mobile);
        Map<String, Object> police = new HashMap<>();
        police.put("occupants", List.of(occupant));
        Map<String, Object> tenant = new HashMap<>();
        tenant.put("occupation", "student");
        tenant.put("police", police);
        List<String> problems = new ArrayList<>();
        TenantPoliceRecordRules.check(List.of(tenant), problems);
        return problems;
    }
}
