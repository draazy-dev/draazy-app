package com.draazy.api.security;

import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.web.Routes;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

public class BotDefenceFilter extends OncePerRequestFilter {
    static final String TOKEN_HEADER = "CF-Turnstile-Response";

    private static final int MAX_TOKEN_LENGTH = 4096;

    public static final String REFUSAL =
            "This request could not be verified as human. Please reload the page and try again.";

    private static final Set<String> CHALLENGED = Set.of(
            Routes.Cities.WAITLIST,
            Routes.ServiceWaitlist.BASE);

    private static final Logger log = LoggerFactory.getLogger(BotDefenceFilter.class);

    private final BotDefence defence;

    public BotDefenceFilter(BotDefence defence) {
        this.defence = defence;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        if (!defence.enforced() || !isChallenged(request) || verified(defence, request)) {
            chain.doFilter(request, response);
            return;
        }
        log.debug("Bot defence refused a challenged write");
        SecurityErrors.write(response, 403, ErrorCodes.FORBIDDEN, REFUSAL);
    }

    public static boolean verified(BotDefence defence, HttpServletRequest request) {
        if (!defence.enforced()) {
            return true;
        }
        String token = request.getHeader(TOKEN_HEADER);
        // A missing token is a refusal; otherwise omitting the header would bypass the gate.
        return token != null && !token.isBlank() && token.length() <= MAX_TOKEN_LENGTH
                && defence.verify(token, request.getRemoteAddr());
    }

    private static boolean isChallenged(HttpServletRequest request) {
        return "POST".equals(request.getMethod())
                && CHALLENGED.contains(
                        WriteRateLimitFilter.normalisedPath(
                                request.getContextPath(), request.getRequestURI()));
    }
}
