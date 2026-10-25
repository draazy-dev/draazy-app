package com.draazy.api.engagement.livingstyle;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Living style — match score")
class LivingStyleCatalogueTest {

    private static final Map<String, Integer> MINE = Map.of("tidy", 0, "food", 1, "sleep", 2, "wfh", 2);

    @Test
    @DisplayName("identical answers score 100")
    void identical() {
        assertThat(LivingStyleCatalogue.score(MINE, MINE)).isEqualTo(new LivingStyleCatalogue.Score(100, 4));
    }

    @Test
    @DisplayName("each step apart costs one point of two, over the answers both gave")
    void distance() {
        Map<String, Integer> theirs = Map.of("tidy", 2, "food", 1, "sleep", 1, "pets", 0);
        // common = tidy, food, sleep -> points 0 + 2 + 1 = 3 of 6
        assertThat(LivingStyleCatalogue.score(MINE, theirs)).isEqualTo(new LivingStyleCatalogue.Score(50, 3));
    }

    @Test
    @DisplayName("fewer than three shared answers give no percentage")
    void tooFewInCommon() {
        Map<String, Integer> theirs = Map.of("tidy", 0, "food", 1, "pets", 0);
        assertThat(LivingStyleCatalogue.score(MINE, theirs)).isEqualTo(new LivingStyleCatalogue.Score(null, 2));
        assertThat(LivingStyleCatalogue.score(MINE, Map.of())).isEqualTo(new LivingStyleCatalogue.Score(null, 0));
    }

    @Test
    @DisplayName("the percentage is rounded half up")
    void rounds() {
        Map<String, Integer> a = Map.of("tidy", 0, "food", 0, "sleep", 0);
        Map<String, Integer> b = Map.of("tidy", 1, "food", 0, "sleep", 0);
        // 5 of 6 points = 83.33
        assertThat(LivingStyleCatalogue.score(a, b).match()).isEqualTo(83);
    }
}
