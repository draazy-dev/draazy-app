package com.draazy.api.engagement.pageview;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.AbstractApiTest;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

// page_views holds session and sometimes user ids, so the 30-day window is a promise to data subjects, and a sweep
// deleting nothing has no symptom. Erasure is proved by ErasureCoverageTest, which reads rows back, not counts.
@DisplayName("Page view retention")
class PageViewRetentionTest extends AbstractApiTest {

    @Autowired PageViewRetention retention;

    @Test
    @DisplayName("deletes views past the window and keeps everything inside it")
    void expiresOnlyWhatIsPastTheWindow() {
        Instant now = Instant.now();
        Instant cutoff = now.minus(PageViewRetention.RETENTION);

        // Uses the real constant, not a retyped literal, so the test cannot outlive a policy change.
        view("sess-old", cutoff.minus(Duration.ofDays(1)));
        view("sess-edge", cutoff.plusSeconds(60));
        view("sess-new", now.minus(Duration.ofDays(1)));

        int removed = retention.expirePageViewsOlderThan(cutoff);

        assertThat(removed).isEqualTo(1);
        assertThat(sessionsLeft())
                .as("the row a minute inside the window must survive; an off-by-one on the "
                        + "comparison would silently shorten the retention promise by a day")
                .containsExactlyInAnyOrder("sess-edge", "sess-new");
    }

    @Test
    @DisplayName("an empty sweep is a no-op rather than a failure")
    void sweepingWithNothingToDoRemovesNothing() {
        view("sess-new", Instant.now());

        // The scheduled sweep runs daily and will find nothing on most of them. Returning zero is
        // the expected steady state, not an error condition to log about.
        assertThat(retention.expirePageViewsOlderThan(
                Instant.now().minus(PageViewRetention.RETENTION)))
                .isZero();
        assertThat(sessionsLeft()).containsExactly("sess-new");
    }

    private java.util.List<String> sessionsLeft() {
        return jdbc.queryForList(
                "select session_id from page_views where session_id like 'sess-%'", String.class);
    }

    private void view(String sessionId, Instant at) {
        jdbc.update("""
                insert into page_views (session_id, path, device, occurred_at)
                values (?, '/listings', 'mobile', ?)
                """, sessionId, java.sql.Timestamp.from(at));
    }
}
