package com.draazy.api.engagement.review;

import com.draazy.api.support.AbstractApiTest;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Engagement — the society / locality / owner rating summary")
class EntityReviewSummaryTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    private void review(String type, String id, int rating, String categoriesJson) {
        review(type, id, rating, ReviewStatuses.PUBLISHED, categoriesJson);
    }

    private void review(String type, String id, int rating, String status, String categoriesJson) {
        jdbc.update("insert into reviews (target_type, target_id, rating, status, categories) "
                        + "values (?, ?, ?, ?, cast(? as jsonb))",
                type, id, rating, status, categoriesJson);
    }

    private String anySocietySlug() {
        return jdbc.queryForObject("select slug from societies order by slug limit 1", String.class);
    }

    private String societyIdOf(String slug) {
        return jdbc.queryForObject("select id::text from societies where slug = ?",
                String.class, slug);
    }

    private String locality(String slug) {
        jdbc.update("insert into localities (slug, name) values (?, ?)", slug, "Fixture " + slug);
        return slug;
    }

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    @Test
    @DisplayName("a society's average and count are the database's, over published reviews only")
    void societySummaryComesFromTheDatabase() throws Exception {
        String slug = anySocietySlug();
        String id = societyIdOf(slug);
        review(ReviewTargetTypes.SOCIETY, id, 5, "{\"Safety\":5,\"Maintenance\":4}");
        review(ReviewTargetTypes.SOCIETY, id, 5, "{\"Safety\":4}");
        review(ReviewTargetTypes.SOCIETY, id, 3, "{\"Management\":2,\"locality\":5}");
        review(ReviewTargetTypes.SOCIETY, id, 1, "{}");
        review(ReviewTargetTypes.SOCIETY, id, 1, ReviewStatuses.REJECTED, "{\"Safety\":1}");

        mvc.perform(get("/reviews/society/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").value(3.5))
                .andExpect(jsonPath("$.summary.reviewCount").value(4))
                .andExpect(jsonPath("$.summary.distribution['1']").value(1))
                .andExpect(jsonPath("$.summary.distribution['2']").value(0))
                .andExpect(jsonPath("$.summary.distribution['3']").value(1))
                .andExpect(jsonPath("$.summary.distribution['4']").value(0))
                .andExpect(jsonPath("$.summary.distribution['5']").value(2))
                .andExpect(jsonPath("$.summary.categoryAverages.Safety").value(4.5))
                .andExpect(jsonPath("$.summary.categoryAverages.Maintenance").value(4.0))
                .andExpect(jsonPath("$.summary.categoryAverages.Management").value(2.0))
                .andExpect(jsonPath("$.summary.categoryAverages.Amenities").doesNotExist())
                .andExpect(jsonPath("$.summary.categoryAverages.Connectivity").doesNotExist())
                .andExpect(jsonPath("$.summary.categoryAverages.locality").doesNotExist());
    }

    @Test
    @DisplayName("a society summary is the same whether addressed by slug or by id")
    void societySummaryAcceptsEitherIdentifier() throws Exception {
        String slug = anySocietySlug();
        String id = societyIdOf(slug);
        review(ReviewTargetTypes.SOCIETY, id, 4, "{\"Safety\":4}");
        review(ReviewTargetTypes.SOCIETY, id, 5, "{\"Safety\":5}");

        for (String identifier : new String[] {slug, id}) {
            mvc.perform(get("/reviews/society/" + identifier))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary.avgRating").value(4.5))
                    .andExpect(jsonPath("$.summary.reviewCount").value(2))
                    .andExpect(jsonPath("$.summary.categoryAverages.Safety").value(4.5));
        }
    }

    @Test
    @DisplayName("a locality summary counts the rows keyed on its slug, which is its primary key")
    void localitySummaryKeysOnTheSlug() throws Exception {
        String slug = locality("summary-fixture-baner");
        review(ReviewTargetTypes.LOCALITY, slug, 5, "{\"locality\":5}");
        review(ReviewTargetTypes.LOCALITY, slug, 4, "{\"locality\":4}");
        review(ReviewTargetTypes.LOCALITY, slug, 4, "{}");
        review(ReviewTargetTypes.SOCIETY, slug, 1, "{\"locality\":1}");

        mvc.perform(get("/reviews/locality/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").value(4.3))
                .andExpect(jsonPath("$.summary.reviewCount").value(3))
                .andExpect(jsonPath("$.summary.categoryAverages.locality").value(4.5));
    }

    @Test
    @DisplayName("an owner summary counts the rows keyed on their user id")
    void ownerSummaryKeysOnTheUserId() throws Exception {
        User o = owner("9850000001");
        String id = o.getId().toString();
        review(ReviewTargetTypes.OWNER, id, 5, "{\"owner\":5}");
        review(ReviewTargetTypes.OWNER, id, 4, "{\"owner\":4}");
        review(ReviewTargetTypes.OWNER, id, 2, ReviewStatuses.PENDING, "{\"owner\":1}");

        mvc.perform(get("/reviews/owner/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").value(4.5))
                .andExpect(jsonPath("$.summary.reviewCount").value(2))
                .andExpect(jsonPath("$.summary.categoryAverages.owner").value(4.5))
                .andExpect(jsonPath("$.summary.distribution['2']").value(0));
    }

    @Test
    @DisplayName("the summary is over every published review, not over the first page of them")
    void summaryIsOverTheWholeCorpusNotOnePage() throws Exception {
        String slug = locality("summary-fixture-kothrud");
        for (int i = 0; i < 20; i++) {
            review(ReviewTargetTypes.LOCALITY, slug, 5, "{\"locality\":5}");
        }
        for (int i = 0; i < 5; i++) {
            review(ReviewTargetTypes.LOCALITY, slug, 1, "{\"locality\":1}");
        }

        mvc.perform(get("/reviews/locality/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.reviewCount").value(25))
                .andExpect(jsonPath("$.summary.avgRating").value(4.2))
                .andExpect(jsonPath("$.summary.distribution['5']").value(20))
                .andExpect(jsonPath("$.summary.distribution['1']").value(5))
                .andExpect(jsonPath("$.summary.categoryAverages.locality").value(4.2))
                .andExpect(jsonPath("$.content.length()").value(20))
                .andExpect(jsonPath("$.totalElements").value(25));
    }

    @Test
    @DisplayName("an unreviewed entity has no average, a zero count and five empty buckets")
    void unreviewedEntityDoesNotDivideByZero() throws Exception {
        String slug = locality("summary-fixture-empty");

        mvc.perform(get("/reviews/locality/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").doesNotExist())
                .andExpect(jsonPath("$.summary.reviewCount").value(0))
                .andExpect(jsonPath("$.summary.distribution['1']").value(0))
                .andExpect(jsonPath("$.summary.distribution['3']").value(0))
                .andExpect(jsonPath("$.summary.distribution['5']").value(0))
                .andExpect(jsonPath("$.summary.categoryAverages").isMap())
                .andExpect(jsonPath("$.summary.categoryAverages.locality").doesNotExist());
    }

    @Test
    @DisplayName("an entity whose only reviews are unpublished reads as unreviewed, not as an error")
    void onlyUnpublishedReviewsReadsAsUnreviewed() throws Exception {
        User o = owner("9850000002");
        String id = o.getId().toString();
        review(ReviewTargetTypes.OWNER, id, 5, ReviewStatuses.PENDING, "{\"owner\":5}");
        review(ReviewTargetTypes.OWNER, id, 1, ReviewStatuses.REJECTED, "{\"owner\":1}");

        mvc.perform(get("/reviews/owner/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").doesNotExist())
                .andExpect(jsonPath("$.summary.reviewCount").value(0))
                .andExpect(jsonPath("$.summary.categoryAverages.owner").doesNotExist());
    }

    @Test
    @DisplayName("a junk or out-of-range category value costs that entry, not the endpoint")
    void malformedCategoryEntriesAreSurvivable() throws Exception {
        String slug = locality("summary-fixture-junk");
        review(ReviewTargetTypes.LOCALITY, slug, 4, "{\"bogus\":3,\"owner\":\"five\",\"value\":4}");
        review(ReviewTargetTypes.LOCALITY, slug, 2, "[1,2,3]");
        review(ReviewTargetTypes.LOCALITY, slug, 3, "{\"locality\":99}");
        review(ReviewTargetTypes.LOCALITY, slug, 3, "{\"locality\":4}");

        mvc.perform(get("/reviews/locality/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.avgRating").value(3.0))
                .andExpect(jsonPath("$.summary.reviewCount").value(4))
                .andExpect(jsonPath("$.summary.categoryAverages.value").value(4.0))
                .andExpect(jsonPath("$.summary.categoryAverages.locality").value(4.0))
                .andExpect(jsonPath("$.summary.categoryAverages.bogus").doesNotExist())
                .andExpect(jsonPath("$.summary.categoryAverages.owner").doesNotExist());
    }

    @ParameterizedTest(name = "{0}")
    @DisplayName("an unknown target is 404, not a zeroed summary of nothing")
    @CsvSource(delimiter = '|', value = {
            "unknown entity type | /reviews/banana/whatever",
            "property is not an entity type here | /reviews/property/00000000-0000-0000-0000-000000000000",
            "unknown society | /reviews/society/no-such-society-anywhere",
            "unknown locality | /reviews/locality/no-such-locality-anywhere",
            "unknown owner | /reviews/owner/00000000-0000-0000-0000-000000000000",
            "malformed owner id is the same 404 as a miss | /reviews/owner/not-a-uuid"
    })
    void unknownTargetIs404(String label, String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isNotFound());
    }
}
