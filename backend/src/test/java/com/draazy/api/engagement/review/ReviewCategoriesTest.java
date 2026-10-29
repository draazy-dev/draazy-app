package com.draazy.api.engagement.review;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Review categories — vocabulary per target type")
class ReviewCategoriesTest {
    @Test
    @DisplayName("the categories vocabulary is per target type, and is the one the UI renders")
    void categoryVocabularyMatchesTheUi() {
        assertThat(ReviewCategories.PROPERTY_KEYS)
                .as("RV_CATS in ReviewsSection.jsx — adding a key here without adding it there "
                        + "ships a sub-rating nothing displays")
                .containsExactlyInAnyOrder("locality", "condition", "value", "owner", "accuracy");

        assertThat(ReviewCategories.SOCIETY_KEYS)
                .as("REVIEW_CATS in pages/consumer/society/constants.js — these ids are what the "
                        + "hub's aspect bars are keyed on, capitalisation included; constants.js "
                        + "says renaming one orphans every stored rating")
                .containsExactlyInAnyOrder(
                        "Safety", "Maintenance", "Management", "Amenities", "Connectivity");

        assertThat(ReviewCategories.PROPERTY_KEYS)
                .doesNotContainAnyElementsOf(ReviewCategories.SOCIETY_KEYS);

        assertThat(ReviewCategories.forTarget(ReviewTargetTypes.LOCALITY))
                .isEqualTo(ReviewCategories.PROPERTY_KEYS);
        assertThat(ReviewCategories.forTarget(ReviewTargetTypes.OWNER))
                .isEqualTo(ReviewCategories.PROPERTY_KEYS);
    }
}
