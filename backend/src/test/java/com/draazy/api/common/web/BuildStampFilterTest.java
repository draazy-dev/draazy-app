package com.draazy.api.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import java.time.Duration;
import java.time.Instant;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class BuildStampFilterTest {
    private static final FilterChain PASS_THROUGH = (req, res) -> {};

    @Test
    void stampsEveryResponseWithTheSameValue() throws Exception {
        String here = stampOf(filterFor(buildAt("2026-09-19T12:00:00Z")));
        String elsewhere = stampOf(filterFor(buildAt("2026-09-19T12:00:00Z")));

        assertThat(here).isNotNull().isEqualTo(elsewhere);
    }

    @Test
    void neverPublishesTheBuildTimestampItself() throws Exception {
        long millis = Instant.parse("2026-09-19T12:00:00Z").toEpochMilli();

        String stamp = stampOf(filterFor(buildAt("2026-09-19T12:00:00Z")));

        assertThat(stamp)
                .matches("^[0-9a-f]{12}$")
                .doesNotContain(Long.toHexString(millis))
                .doesNotContain(String.valueOf(millis));
    }

    @Test
    void aDifferentBuildProducesADifferentStamp() throws Exception {
        String before = stampOf(filterFor(buildAt("2026-09-19T12:00:00Z")));
        String after = stampOf(filterFor(buildAt("2026-09-19T12:00:01Z")));

        assertThat(after).isNotEqualTo(before);
    }

    @Test
    void omitsTheHeaderWhenTheBuildIsUnknown() throws Exception {
        assertThat(stampOf(filterFor(null))).isNull();
    }

    @Test
    void omitsTheHeaderOnAReadTheEdgeOrBrowserMayReplay() throws Exception {
        var filter = filterFor(buildAt("2026-09-19T12:00:00Z"), Duration.ofSeconds(30));

        assertThat(stampOf(filter, new MockHttpServletRequest("GET", "/bootstrap"))).isNull();
        assertThat(stampOf(filter, new MockHttpServletRequest("GET", "/me"))).isNotNull();
    }

    private static String stampOf(BuildStampFilter filter) throws Exception {
        return stampOf(filter, new MockHttpServletRequest("GET", "/bootstrap"));
    }

    private static String stampOf(BuildStampFilter filter, MockHttpServletRequest request)
            throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, PASS_THROUGH);
        return response.getHeader(BuildStampFilter.BUILD_HEADER);
    }

    private static BuildStampFilter filterFor(BuildProperties build) {
        return filterFor(build, Duration.ZERO);
    }

    @SuppressWarnings("unchecked")
    private static BuildStampFilter filterFor(BuildProperties build, Duration publicReadTtl) {
        ObjectProvider<BuildProperties> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(build);
        return new BuildStampFilter(provider, new PublicReadCacheFilter(publicReadTtl));
    }

    private static BuildProperties buildAt(String instant) {
        var props = new Properties();
        props.setProperty("group", "com.draazy");
        props.setProperty("artifact", "draazy-api");
        props.setProperty("version", "0.0.1-SNAPSHOT");
        props.setProperty("time", String.valueOf(Instant.parse(instant).toEpochMilli()));
        return new BuildProperties(props);
    }
}
