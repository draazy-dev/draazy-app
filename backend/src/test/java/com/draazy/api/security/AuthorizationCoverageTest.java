package com.draazy.api.security;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.lang.reflect.AnnotatedElement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.util.SimpleMethodInvocation;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;

/** Every served route is pinned public or refused anonymously; no paged list breaks on crafted paging. */
@DisplayName("Security — no route ships unclassified, and no admin route is a consumer's")
class AuthorizationCoverageTest extends AbstractApiTest {

    private static final List<String> NOT_OURS = List.of("/error", "/actuator");

    private static final String PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

    private static final Pattern OPEN_EXPRESSION = Pattern.compile("(?i)permitAll|isAuthenticated|isAnonymous");

    private static final Pattern BACK_OFFICE_GUARD = Pattern.compile(
            "'(" + Roles.ADMIN + "|" + Roles.STAFF + ")'|@" + BackOfficePermissions.BEAN + "\\.");

    // A customer's own list on the same route; its guard only narrows what staff may see.
    private static final Set<String> SHARED_WITH_CUSTOMERS = Set.of("GET /service-requests");

    private static final String[][] HOSTILE_PAGING = {
            {"sort", "nosuchfield,desc"}, {"sort", "password,asc"}, {"page", "2147483647"}, {"page", "-1"},
            {"page", "+21474837"}, {"page", "\u0662\u0661\u0664\u0667\u0664\u0668\u0663\u0667"}};

    // Mirrors SecurityConfig's permitAll list; a route answering anonymous callers is added here deliberately.
    private static final Set<String> PUBLIC = Set.of(
            "POST /auth/login", "POST /auth/staff-login", "POST /auth/staff-login/verify",
            "POST /auth/staff-login/enrol", "POST /auth/staff-login/enrol/confirm", "POST /auth/staff-invite/redeem",
            "GET /bootstrap", "GET /faqs", "GET /fees",
            "GET /properties", "GET /properties/{id}", "GET /properties/featured", "GET /properties/cards",
            "GET /properties/compare", "GET /properties/reels", "GET /properties/search-index",
            "GET /properties/similar", "GET /properties/{propId}/reviews", "GET /owners/{id}",
            "GET /localities", "GET /localities/{slug}", "GET /localities/search", "POST /localities/resolve",
            "GET /societies", "GET /societies/{slug}", "GET /societies/{slug}/brief", "GET /societies/resolve",
            "GET /societies/top", "GET /reviews/{entityType}/{entityId}",
            "GET /flatmates/feed", "GET /flatmates/groups/{id}", "GET /flatmates/posts/{id}", "GET /flatmates/rooms/{id}",
            "GET /documents/shared/url",
            "POST /cities/waitlist", "POST /service-waitlist", "POST /demand-signals", "POST /page-views",
            "POST /help/feedback",
            // Signature-verified in the handler, and always 200 so Cashfree does not retry a refusal.
            "POST /webhooks/cashfree/payment");

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping handlers;

    @Autowired
    UserRepository users;

    @Autowired
    ApplicationContext context;

    private record Route(String method, String pattern, HandlerMethod handler) {
        String key() {
            return method + " " + pattern;
        }
    }

    @Test
    @DisplayName("an anonymous caller gets 401 from every route outside the pinned public set")
    void anonymousIsRefusedOutsideThePublicSet() throws Exception {
        Map<String, Integer> answered = new TreeMap<>();
        for (Route route : routes()) {
            int status = mvc.perform(request(route)).andReturn().getResponse().getStatus();
            if (status != 401) {
                answered.put(route.key(), status);
            }
        }
        assertThat(answered.keySet())
                .as("routes answering an anonymous caller, with status: %s", answered)
                .isEqualTo(new TreeSet<>(PUBLIC));
    }

    @Test
    @DisplayName("every /admin handler carries a @PreAuthorize that is more than 'signed in'")
    void adminHandlersAreGuarded() {
        Set<String> unguarded = new TreeSet<>();
        for (Route route : routes()) {
            if (!route.pattern().startsWith("/admin")) {
                continue;
            }
            PreAuthorize guard = guardOf(route.handler());
            if (guard == null || OPEN_EXPRESSION.matcher(guard.value()).find()) {
                unguarded.add(route.key());
            }
        }
        assertThat(unguarded)
                .as("SecurityConfig only requires sign-in on /admin/**; the role or function check is the handler's")
                .isEmpty();
    }

    @Test
    @DisplayName("a signed-in consumer never gets a 2xx or a 5xx from an /admin route")
    void consumerNeverReachesAdmin() throws Exception {
        User buyer = new User("9" + String.format("%09d", System.nanoTime() % 1_000_000_000L), Roles.Wire.BUYER);
        buyer.setMobileVerified(true);
        users.saveAndFlush(buyer);
        String token = bearer(buyer);

        Map<String, Integer> reached = new TreeMap<>();
        for (Route route : routes()) {
            if (!route.pattern().startsWith("/admin")) {
                continue;
            }
            int status = mvc.perform(request(route).header(HttpHeaders.AUTHORIZATION, token))
                    .andReturn().getResponse().getStatus();
            if (status < 300 || status >= 500) {
                reached.put(route.key(), status);
            }
        }
        assertThat(reached).as("admin routes a buyer reached, or broke").isEmpty();
    }

    @Test
    @DisplayName("every back-office guard, evaluated directly, refuses a consumer even where body validation answers first")
    void adminGuardsRefuseAConsumer() {
        var expressions = new DefaultMethodSecurityExpressionHandler();
        expressions.setApplicationContext(context);
        var preAuthorize = new PreAuthorizeAuthorizationManager();
        preAuthorize.setExpressionHandler(expressions);
        var principal = new AuthPrincipal(UUID.randomUUID(), Roles.Wire.BUYER, null, true, true);
        Authentication buyer = new UsernamePasswordAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + Roles.Wire.BUYER.toUpperCase())));

        Set<String> granted = new TreeSet<>();
        for (Route route : routes()) {
            PreAuthorize guard = guardOf(route.handler());
            boolean backOffice = route.pattern().startsWith("/admin")
                    || guard != null && BACK_OFFICE_GUARD.matcher(guard.value()).find();
            if (!backOffice || SHARED_WITH_CUSTOMERS.contains(route.key())) {
                continue;
            }
            HandlerMethod handler = route.handler().createWithResolvedBean();
            var invocation = new SimpleMethodInvocation(handler.getBean(), handler.getMethod(),
                    new Object[handler.getMethod().getParameterCount()]);
            AuthorizationResult result = preAuthorize.authorize(() -> buyer, invocation);
            if (result == null || result.isGranted()) {
                granted.add(route.key());
            }
        }
        assertThat(granted).as("back-office guards that let a buyer through").isEmpty();
    }

    @Test
    @DisplayName("hostile paging on any paged list is never a 500")
    void hostilePagingIsNeverAServerError() throws Exception {
        User admin = new User("8" + String.format("%09d", System.nanoTime() % 1_000_000_000L), Roles.Wire.ADMIN);
        admin.setMobileVerified(true);
        users.saveAndFlush(admin);
        String token = bearer(admin);

        Map<String, Integer> broke = new TreeMap<>();
        for (Route route : routes()) {
            if (!route.method().equals("GET") || Arrays.stream(route.handler().getMethodParameters())
                    .noneMatch(p -> Pageable.class.isAssignableFrom(p.getParameterType()))) {
                continue;
            }
            for (String[] param : HOSTILE_PAGING) {
                int status = isolated(() -> mvc.perform(request(route).param(param[0], param[1]).param("size", "100")
                                .header(HttpHeaders.AUTHORIZATION, token))
                        .andReturn().getResponse().getStatus());
                if (status >= 500) {
                    broke.put(route.key() + "?" + param[0] + "=" + param[1], status);
                }
            }
        }
        assertThat(broke).as("paged lists that a crafted page or sort broke").isEmpty();
    }

    /** A failed statement aborts the shared test transaction; a savepoint per probe keeps the next one honest. */
    private int isolated(Callable<Integer> probe) throws Exception {
        jdbc.execute("savepoint paging_probe");
        try {
            return probe.call();
        } finally {
            jdbc.execute("rollback to savepoint paging_probe");
        }
    }

    private List<Route> routes() {
        List<Route> routes = new ArrayList<>();
        handlers.getHandlerMethods().forEach((info, handler) -> {
            var patterns = info.getPathPatternsCondition();
            if (patterns == null
                    || AnnotatedElementUtils.hasAnnotation(handler.getBeanType(), LocalOnly.class)) {
                return;
            }
            Set<String> methods = new TreeSet<>();
            info.getMethodsCondition().getMethods().forEach(m -> methods.add(m.name()));
            if (methods.isEmpty()) {
                methods.add("GET");
            }
            for (String pattern : patterns.getPatternValues()) {
                if (NOT_OURS.stream().noneMatch(pattern::startsWith)) {
                    methods.forEach(m -> routes.add(new Route(m, pattern, handler)));
                }
            }
        });
        return routes;
    }

    private static MockHttpServletRequestBuilder request(Route route) {
        String url = route.pattern().replaceAll("\\{[^}]+}", PLACEHOLDER_ID);
        MockHttpServletRequestBuilder request = MockMvcRequestBuilders.request(HttpMethod.valueOf(route.method()), url);
        return Set.of("POST", "PUT", "PATCH").contains(route.method())
                ? request.contentType(MediaType.APPLICATION_JSON).content("{}")
                : request;
    }

    private static PreAuthorize guardOf(HandlerMethod handler) {
        PreAuthorize onMethod = AnnotatedElementUtils.findMergedAnnotation(handler.getMethod(), PreAuthorize.class);
        AnnotatedElement type = handler.getBeanType();
        return onMethod != null ? onMethod : AnnotatedElementUtils.findMergedAnnotation(type, PreAuthorize.class);
    }
}
