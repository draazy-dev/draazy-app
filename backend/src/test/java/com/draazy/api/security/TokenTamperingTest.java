package com.draazy.api.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;

@DisplayName("A forged, expired or re-signed access token never authenticates")
class TokenTamperingTest extends AbstractApiTest {

    private static final String PROTECTED = Routes.Auth.ME;
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    @Autowired
    UserRepository users;

    @Value("${draazy.security.jwt.secret}")
    String secret;

    private User buyer;

    @BeforeEach
    void persistBuyer() {
        buyer = new User("9791110001", Roles.Wire.BUYER);
        buyer.setMobileVerified(true);
        users.saveAndFlush(buyer);
    }

    private SecretKey key(String material) {
        return Keys.hmacShaKeyFor(material.getBytes(StandardCharsets.UTF_8));
    }

    private String signed(SecretKey key, String role, Instant expiry) {
        return Jwts.builder()
                .subject(buyer.getId().toString())
                .claim("role", role)
                .claim("mobileVerified", true)
                .claim("verified", false)
                .issuedAt(Date.from(Instant.now().minusSeconds(120)))
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    private String validToken() {
        return signed(key(secret), Roles.Wire.BUYER, Instant.now().plus(Duration.ofMinutes(10)));
    }

    private static String segment(String json) {
        return B64.encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    private void assertAnonymous(String token) throws Exception {
        mvc.perform(get(PROTECTED).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    @DisplayName("a validly signed token is accepted (positive control)")
    void validTokenIsAccepted() throws Exception {
        mvc.perform(get(PROTECTED).header(HttpHeaders.AUTHORIZATION, "Bearer " + validToken()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("alg none with an empty signature is refused")
    void algNoneIsRefused() throws Exception {
        String payload = segment("{\"sub\":\"" + buyer.getId() + "\",\"role\":\"buyer\",\"exp\":"
                + Instant.now().plusSeconds(600).getEpochSecond() + "}");
        assertAnonymous(segment("{\"alg\":\"none\",\"typ\":\"JWT\"}") + "." + payload + ".");
    }

    @Test
    @DisplayName("a token signed with another HMAC key is refused")
    void wrongKeyIsRefused() throws Exception {
        assertAnonymous(signed(key("another-hs256-secret-key-that-is-also-32-bytes!"),
                Roles.Wire.BUYER, Instant.now().plus(Duration.ofMinutes(10))));
    }

    @Test
    @DisplayName("a token signed with the right key but expired 60s ago is refused")
    void expiredTokenIsRefused() throws Exception {
        assertAnonymous(signed(key(secret), Roles.Wire.BUYER, Instant.now().minusSeconds(60)));
    }

    @Test
    @DisplayName("swapping the payload for an admin claim while keeping the signature is refused")
    void swappedPayloadIsRefused() throws Exception {
        String[] parts = validToken().split("\\.");
        String adminPayload = segment("{\"sub\":\"" + buyer.getId() + "\",\"role\":\"admin\","
                + "\"mobileVerified\":true,\"verified\":false,\"exp\":"
                + Instant.now().plusSeconds(600).getEpochSecond() + "}");
        assertAnonymous(parts[0] + "." + adminPayload + "." + parts[2]);
    }

    @Test
    @DisplayName("a buyer's genuine token is forbidden on an admin route: the role comes from the database")
    void buyerTokenIsForbiddenOnAdminRoute() throws Exception {
        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, "Bearer " + validToken()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a token claiming admin for a buyer account is forbidden on an admin route")
    void forgedAdminClaimIsForbiddenOnAdminRoute() throws Exception {
        String claimsAdmin = signed(key(secret), Roles.Wire.ADMIN, Instant.now().plus(Duration.ofMinutes(10)));
        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, "Bearer " + claimsAdmin))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a garbage bearer on a public route is still served: the filter fails soft")
    void badBearerOnPublicRouteStillServes() throws Exception {
        mvc.perform(get("/properties").header(HttpHeaders.AUTHORIZATION, "Bearer not.a.token"))
                .andExpect(status().isOk());
    }
}
