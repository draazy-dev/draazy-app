package com.draazy.api.security;

import com.draazy.api.common.web.RequestCorrelation;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Resolves the bearer token on every request. Rationale: docs/system/cross-cutting.md#jwt-auth-filter. */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

    private final JwtService jwtService;
    private final RoleSource roles;

    public JwtAuthFilter(JwtService jwtService, RoleSource roles) {
        this.jwtService = jwtService;
        this.roles = roles;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                AuthPrincipal principal =
                        current(jwtService.verify(header.substring(BEARER.length())));
                var authority = new SimpleGrantedAuthority("ROLE_" + principal.role().toUpperCase());
                var auth = new UsernamePasswordAuthenticationToken(
                        principal, null, List.of(authority));
                SecurityContextHolder.getContext().setAuthentication(auth);
                MDC.put(RequestCorrelation.USER_ID_MDC, principal.userId().toString());
                MDC.put(RequestCorrelation.USER_ROLE_MDC, principal.role());
            } catch (JwtException | IllegalArgumentException ex) {
                // ponytail: an unparseable token means "anonymous"; downstream authz decides. Not an
                // error path (probing/expired tokens are routine) so log at DEBUG, never WARN/ERROR.
                log.debug("Rejecting bearer token: {}", ex.getMessage());
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    // The live role replaces the claimed one (no row: the claim stands). A blocked account, or a token issued
    // in or before the second its sessions were revoked (iat is whole seconds), is refused.
    private AuthPrincipal current(JwtService.Verified token) {
        AuthPrincipal claimed = token.principal();
        var standing = roles.standingOf(claimed.userId());
        if (standing.isEmpty()) {
            return claimed;
        }
        Instant revoked = standing.get().getSessionsRevokedAt();
        if (standing.get().isBlocked() || (revoked != null && !token.issuedAt().isAfter(revoked))) {
            throw new JwtException("Session revoked");
        }
        String role = standing.get().getRole();
        if (role.equals(claimed.role())) {
            return claimed;
        }
        return new AuthPrincipal(claimed.userId(), role, claimed.team(),
                claimed.mobileVerified(), claimed.verified());
    }
}
