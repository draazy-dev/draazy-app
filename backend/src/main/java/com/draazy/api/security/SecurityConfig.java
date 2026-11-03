package com.draazy.api.security;

import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.web.Routes;
import jakarta.servlet.DispatcherType;
import java.time.Duration;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {
    static final String[] API_DOCS = {"/docs", "/docs/**", "/swagger-ui/**", "/webjars/**", "/openapi/**"};

    private final JwtService jwtService;
    private final RestAuthEntryPoint authEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;
    private final BotDefence botDefence;
    private final WriteRateLimitStore.Factory rateLimitStores;
    private final boolean rateLimitEnabled;
    private final int writeBudget;
    private final int localityResolveBudget;
    private final int propertyReadBudget;
    private final int livingStyleBudget;
    private final Duration rateLimitWindow;
    private final boolean proxyAware;
    private final Optional<OriginGateFilter> originGate;
    private final boolean publicApiDocs;

    public SecurityConfig(JwtService jwtService, RestAuthEntryPoint authEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler, BotDefence botDefence,
            WriteRateLimitStore.Factory rateLimitStores,
            @Value("${draazy.security.rate-limit.enabled:true}") boolean rateLimitEnabled,
            @Value("${draazy.security.rate-limit.writes-per-window:120}") int writeBudget,
            @Value("${draazy.security.rate-limit.locality-resolves-per-window:10}") int localityResolveBudget,
            @Value("${draazy.security.rate-limit.property-reads-per-window:600}") int propertyReadBudget,
            @Value("${draazy.security.rate-limit.living-style-reads-per-window:60}") int livingStyleBudget,
            @Value("${draazy.security.rate-limit.window-seconds:60}") long windowSeconds,
            @Value("${draazy.security.trusted-proxies:none}") String trustedProxies,
            @Value("${draazy.security.origin-secret}") String originSecret,
            @Value("${draazy.security.public-api-docs:false}") boolean publicApiDocs) {
        this.publicApiDocs = publicApiDocs;
        this.jwtService = jwtService;
        this.authEntryPoint = authEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;

        this.botDefence = botDefence;

        this.rateLimitStores = rateLimitStores;
        this.rateLimitEnabled = rateLimitEnabled;
        this.writeBudget = writeBudget;
        this.localityResolveBudget = localityResolveBudget;
        this.propertyReadBudget = propertyReadBudget;
        this.livingStyleBudget = livingStyleBudget;
        this.rateLimitWindow = Duration.ofSeconds(windowSeconds);

        this.originGate = OriginGateFilter.fromSetting(originSecret);
        this.proxyAware = originGate.isPresent()
                || !TrustedProxyConfig.NO_PROXY.equalsIgnoreCase(trustedProxies.trim());
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, RoleSource roles,
            PlatformSettings platformSettings) throws Exception {
        http.authorizeHttpRequests(auth -> {
            var docs = auth.requestMatchers(API_DOCS);
            if (publicApiDocs) {
                docs.permitAll();
            } else {
                docs.denyAll();
            }
        });
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())

                // Spring Security omits Referrer-Policy by default, and GET /documents/shared carries a
                // credential in its query string.
                .headers(headers -> headers.referrerPolicy(referrer ->
                        referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()

                        // Anonymous by design: the single-use invite token is the credential.
                        .requestMatchers(HttpMethod.POST,
                                Routes.Auth.LOGIN, Routes.Auth.STAFF_LOGIN,
                                Routes.Auth.STAFF_LOGIN_VERIFY, Routes.Auth.STAFF_LOGIN_ENROL,
                                Routes.Auth.STAFF_LOGIN_ENROL_CONFIRM,
                                Routes.Auth.REFRESH,
                                Routes.Auth.STAFF_INVITE_REDEEM).permitAll()

                        .requestMatchers(HttpMethod.GET,
                                Routes.Properties.BASE, Routes.Properties.FEATURED,
                                Routes.Properties.ANY_SINGLE).permitAll()

                        .requestMatchers(HttpMethod.GET, Routes.Owners.ANY_SINGLE).permitAll()

                        .requestMatchers(HttpMethod.GET,
                                Routes.Localities.ANY_SINGLE,
                                Routes.Societies.BASE, Routes.Societies.ANY_SINGLE, Routes.Societies.ANY_BRIEF,
                                Routes.Fees.BASE,

                                Routes.Bootstrap.BASE).permitAll()

                        .requestMatchers(HttpMethod.POST, Routes.Cities.WAITLIST).permitAll()

                        .requestMatchers(HttpMethod.POST, Routes.Localities.RESOLVE).permitAll()

                        .requestMatchers(HttpMethod.POST, Routes.ServiceWaitlist.BASE).permitAll()

                        .requestMatchers(HttpMethod.POST, Routes.DemandSignals.BASE).permitAll()
                        .requestMatchers(HttpMethod.POST, Routes.PageViews.BASE).permitAll()
                        .requestMatchers(HttpMethod.POST, Routes.ClientErrors.BASE).permitAll()

                        .requestMatchers(HttpMethod.POST, Routes.HelpFeedback.BASE).permitAll()

                        .requestMatchers(HttpMethod.GET,
                                Routes.Flatmates.FEED,
                                Routes.Flatmates.GROUP_BY_ID,
                                Routes.Flatmates.ROOM_BY_ID,
                                Routes.Flatmates.POST_BY_ID).permitAll()

                        .requestMatchers(HttpMethod.GET, Routes.Flatmates.OWNER_NOTICE).permitAll()
                        .requestMatchers(HttpMethod.POST, Routes.Flatmates.OWNER_NOTICE_ANSWER).permitAll()

                        .requestMatchers(HttpMethod.GET,
                                Routes.Content.FAQS,
                                Routes.Reviews.FOR_PROPERTY,
                                Routes.Reviews.FOR_ENTITY).permitAll()

                        .requestMatchers(HttpMethod.GET, Routes.Documents.SHARED,
                                Routes.Documents.SHARED_URL).permitAll()

                        .requestMatchers(HttpMethod.POST,
                                Routes.Webhooks.CASHFREE_PAYMENT, Routes.Webhooks.WHATSAPP, Routes.Webhooks.ZEPTOMAIL).permitAll()
                        .requestMatchers(HttpMethod.GET, Routes.Webhooks.WHATSAPP).permitAll()

                        .requestMatchers("/", "/favicon.ico",
                                "/actuator/health/**", "/actuator/info").permitAll()

                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))

                .addFilterBefore(new JwtAuthFilter(jwtService, roles),
                        UsernamePasswordAuthenticationFilter.class);
        if (rateLimitEnabled) {
            http.addFilterAfter(
                    new WriteRateLimitFilter(writeBudget, rateLimitWindow, proxyAware,
                            rateLimitStores, localityResolveBudget, propertyReadBudget, livingStyleBudget),
                    JwtAuthFilter.class);
        }

        http.addFilterAfter(new BotDefenceFilter(botDefence), JwtAuthFilter.class);

        http.addFilterAfter(new MaintenanceModeFilter(platformSettings), BotDefenceFilter.class);

        originGate.ifPresent(gate -> http.addFilterBefore(gate, JwtAuthFilter.class));
        return http.build();
    }

    @Bean
    RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.withRolePrefix("ROLE_")
                .role(Roles.ADMIN).implies(Roles.MANAGER)
                .role(Roles.MANAGER).implies(Roles.STAFF)
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
