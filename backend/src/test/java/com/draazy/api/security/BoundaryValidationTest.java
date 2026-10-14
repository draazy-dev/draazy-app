package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Hostile input at the edge is a 4xx in the JSON error envelope, never a 5xx")
class BoundaryValidationTest extends AbstractApiTest {

    private static final int DEPTH = 2000;

    @Autowired
    UserRepository users;

    private String token;

    @BeforeEach
    void authenticatedBuyer() {
        User buyer = new User("9791140001", Roles.Wire.BUYER);
        buyer.setMobileVerified(true);
        users.saveAndFlush(buyer);
        token = bearer(buyer);
    }

    private MvcResult perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, token)).andReturn();
    }

    private static void assertEnvelope(MvcResult result) throws Exception {
        int status = result.getResponse().getStatus();
        jsonPath("$.error").exists().match(result);
        jsonPath("$.status").value(status).match(result);
    }

    static Stream<Arguments> listRoutesAndQueries() {
        Stream<String> routes = Stream.of(Routes.MeListings.BASE, Routes.Flatmates.MY_ROOMS, Routes.Properties.BASE);
        return routes.flatMap(route -> Stream.of(
                "page=-1", "size=0", "size=-5", "page=abc", "size=abc", "page=2147483647",
                "size=2147483647", "sort=nosuchfield,desc", "sort=password,asc", "sort=,", "sort=id;drop table users")
                .map(query -> Arguments.of(route, query)));
    }

    @ParameterizedTest(name = "GET {0}?{1}")
    @MethodSource("listRoutesAndQueries")
    @DisplayName("paging and sort parameters never produce a 5xx")
    void pagingParametersNeverProduceA5xx(String route, String query) throws Exception {
        MvcResult result = perform(get(route + "?" + query));

        int status = result.getResponse().getStatus();
        assertThat(status).as("status for %s?%s was %s: %s", route, query, status,
                result.getResponse().getContentAsString()).isLessThan(500);
        if (status >= 400) {
            assertEnvelope(result);
        }
    }

    private static String nested(String open, String close) {
        return open.repeat(DEPTH) + "1" + close.repeat(DEPTH);
    }

    private static Stream<Arguments> hostileBodies() {
        return Stream.of(
                Arguments.of("empty body", ""),
                Arguments.of("whitespace body", "   \n\t "),
                Arguments.of("literal null", "null"),
                Arguments.of("array instead of object", "[]"),
                Arguments.of("scalar instead of object", "\"text\""),
                Arguments.of("price as a string", listing("rent", "\"abc\"")),
                Arguments.of("price as an object", listing("rent", "{\"a\":1}")),
                Arguments.of("price as an array", listing("rent", "[1,2]")),
                Arguments.of("unknown deal value", listing("swap", "25000")),
                Arguments.of("propertyId as an object", "{\"propertyId\":{\"a\":1}}"),
                Arguments.of("2000-level nested object", nested("{\"a\":", "}")),
                Arguments.of("2000-level nested array", nested("[", "]")));
    }

    private static String listing(String deal, String price) {
        return "{\"title\":\"Boundary flat\",\"deal\":\"" + deal + "\",\"propertyType\":\"apartment\","
                + "\"price\":" + price + ",\"locality\":\"Baner\",\"city\":\"Pune\"}";
    }

    @ParameterizedTest(name = "POST {0}: {1}")
    @MethodSource("hostileBodyCases")
    @DisplayName("a malformed or mistyped JSON body is 400 or 422 in the error envelope")
    void hostileBodyIsRefusedCleanly(String route, String label, String body) throws Exception {
        MvcResult result = perform(post(route).contentType(MediaType.APPLICATION_JSON).content(body));

        int status = result.getResponse().getStatus();
        assertThat(status).as("%s on %s answered %s: %s", label, route, status,
                result.getResponse().getContentAsString()).isIn(400, 422);
        assertEnvelope(result);
    }

    static Stream<Arguments> hostileBodyCases() {
        Stream<String> routes = Stream.of(Routes.MeListings.BASE, Routes.Contacts.REQUEST);
        return routes.flatMap(route -> hostileBodies()
                .map(b -> Arguments.of(route, b.get()[0], b.get()[1])));
    }

    static Stream<Arguments> uuidRoutes() {
        return Stream.of(
                Arguments.of("DELETE", Routes.Engagement.NOTIFICATION_BY_ID),
                Arguments.of("GET", Routes.Flatmates.GROUP_BY_ID),
                Arguments.of("GET", Routes.Flatmates.ROOM_BY_ID),
                Arguments.of("GET", Routes.Flatmates.POST_BY_ID),
                Arguments.of("DELETE", Routes.Flatmates.ROOM_BY_ID),
                Arguments.of("DELETE", Routes.Flatmates.POST_BY_ID),
                Arguments.of("DELETE", Routes.Flatmates.GROUP_MEMBERSHIP),
                Arguments.of("GET", Routes.Flatmates.MY_POST_BY_ID));
    }

    @ParameterizedTest(name = "{0} {1} with a malformed UUID")
    @MethodSource("uuidRoutes")
    @DisplayName("a malformed UUID path variable is 400 in the error envelope")
    void malformedUuidIs400(String method, String template) throws Exception {
        String path = template.replace("{id}", "not-a-uuid");
        MvcResult result = perform("GET".equals(method) ? get(path) : delete(path));

        assertThat(result.getResponse().getStatus())
                .as("%s %s answered %s: %s", method, path, result.getResponse().getStatus(),
                        result.getResponse().getContentAsString())
                .isEqualTo(400);
        assertEnvelope(result);
    }
}
