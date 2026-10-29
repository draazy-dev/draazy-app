package com.draazy.api.services.request;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.error.ValidationException;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Rent agreement property IGR particulars")
class PropertyIgrRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 4, 1);

    @Test
    @DisplayName("requests filed before IGR property fields existed still pass")
    void absentValuesPass() {
        assertThatCode(() -> state(Map.of("prop", Map.of("area", "850"), "terms", Map.of("parking", "none"))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a stated taluka must be usable on the IGR portal")
    void taluka() {
        assertThatCode(() -> state(Map.of("prop", Map.of("taluka", "Haveli"))))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> state(Map.of("prop", Map.of("taluka", ""))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("_state.prop.taluka");
        assertThatThrownBy(() -> state(Map.of("prop", Map.of("taluka", "Mumbai"))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("_state.prop.taluka");
    }

    @Test
    @DisplayName("a present-but-blank required text field is refused; an absent key still saves")
    void blankRequiredTextIsRefused() {
        for (String key : java.util.List.of("landmark", "policeStation", "roadVicinity", "roadType")) {
            assertThatThrownBy(() -> state(Map.of("prop", Map.of(key, " "))))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("_state.prop." + key + " is required");
        }
        assertThatCode(() -> state(Map.of("prop", Map.of("taluka", "Haveli")))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("text fields are length-capped")
    void textLengths() {
        for (String key : java.util.List.of("landmark", "policeStation", "roadVicinity", "roadType")) {
            assertThatThrownBy(() -> state(Map.of("prop", Map.of(key, "x".repeat(81)))))
                    .hasMessageContaining("_state.prop." + key + " must be at most 80");
        }
    }

    @Test
    @DisplayName("fields staff now read from Index II are no longer validated, so old drafts still save")
    void retiredFieldsAreTolerated() {
        assertThatCode(() -> state(Map.of("prop", Map.of("villageCity", "", "roadName", "x".repeat(500),
                "zone", " ", "constructionType", "mud", "propertyAge", "old", "galleryArea", "0",
                "galleryAreaUnit", "guntha", "propertyAttributes", "CTS 1")))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a parking area is sane when stated")
    void optionalAreas() {
        assertThatCode(() -> state(Map.of("terms", Map.of("parking", "car", "parkingArea", "120",
                "parkingAreaUnit", "sqm")))).doesNotThrowAnyException();
        assertThatThrownBy(() -> state(Map.of("terms", Map.of("parking", "none", "parkingArea", "120"))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("_state.terms.parkingArea requires parking");
        assertThatThrownBy(() -> state(Map.of("terms", Map.of("parkingAreaUnit", "guntha"))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("_state.terms.parkingAreaUnit");
    }

    private static void state(Map<String, Object> state) {
        RentAgreementDetailsRules.check(Map.of("_state", state), TODAY);
    }
}
