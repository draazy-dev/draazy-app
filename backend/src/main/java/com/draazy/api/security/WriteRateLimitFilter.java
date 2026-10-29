package com.draazy.api.security;

import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.web.Routes;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UriUtils;

public class WriteRateLimitFilter extends OncePerRequestFilter {
    static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");

    private static final Set<String> LIMITED_READS = Set.of(
            Routes.Documents.SHARED,
            Routes.Documents.SHARED_URL,
            Routes.Societies.RESOLVE,
            Routes.Flatmates.OWNER_NOTICE,
            Routes.Webhooks.WHATSAPP,
            "/me/data-export");

    private static final Set<String> PROVIDER_CALLBACKS =
            Set.of(Routes.Webhooks.CASHFREE_PAYMENT, Routes.Webhooks.WHATSAPP);

    private static final int CALLBACK_BUDGET_MULTIPLIER = 50;

    private static final long MAX_CALLBACK_BODY_BYTES = 64L * 1024;

    private static final Duration LIVING_STYLE_WINDOW = Duration.ofMinutes(10);

    private static final Logger log = LoggerFactory.getLogger(WriteRateLimitFilter.class);

    static final String FORWARDED_FOR = "X-Forwarded-For";

    private final WriteRateLimitStore limiter;
    private final WriteRateLimitStore callbackLimiter;
    private final WriteRateLimitStore localityResolveLimiter;
    private final WriteRateLimitStore propertyReadLimiter;
    private final WriteRateLimitStore livingStyleLimiter;
    private final Duration window;
    private final boolean proxyAware;
    private volatile boolean misconfigurationLogged;

    public WriteRateLimitFilter(int budget, Duration window, boolean proxyAware,
            WriteRateLimitStore.Factory stores, int localityResolveBudget, int propertyReadBudget,
            int livingStyleBudget) {
        this.limiter = stores.create("w", budget, window);
        this.localityResolveLimiter = stores.create("loc", localityResolveBudget, window);
        this.propertyReadLimiter = stores.create("pr", propertyReadBudget, window);
        this.livingStyleLimiter = stores.create("ls", livingStyleBudget, LIVING_STYLE_WINDOW);
        long callbackBudget = (long) budget * CALLBACK_BUDGET_MULTIPLIER;
        this.callbackLimiter = stores.create(
                "cb", (int) Math.min(Integer.MAX_VALUE, callbackBudget), window);
        this.window = window;
        this.proxyAware = proxyAware;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String path = path(request);

        if (isProviderCallback(request, path)) {
            long declared = request.getContentLengthLong();
            if (declared < 0 || declared > MAX_CALLBACK_BODY_BYTES) {
                // A negative length means unknown (chunked) and passes any `> cap` test, so check it explicitly.
                SecurityErrors.write(response, 413, ErrorCodes.RATE_LIMITED,
                        "Callback body must declare a length of at most "
                                + MAX_CALLBACK_BODY_BYTES + " bytes.");
                return;
            }
            if (!allow(callbackLimiter, request, response)) {
                return;
            }
            chain.doFilter(request, response);
            return;
        }

        if (isLocalityResolve(request, path) && !allow(localityResolveLimiter, request, response)) {
            return;
        }

        if (isAnonymousPropertyRead(request, path) && !allow(propertyReadLimiter, request, response)) {
            return;
        }

        if (isLivingStyleRead(request, path) && !allow(livingStyleLimiter, request, response)) {
            return;
        }

        if (!isLimited(request, path) || allow(limiter, request, response)) {
            chain.doFilter(request, response);
        }
    }

    private boolean allow(WriteRateLimitStore against, HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        int retryAfter = against.tryAcquire(callerKey(request), Instant.now());
        if (retryAfter == 0) {
            return true;
        }
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfter));
        SecurityErrors.write(response, 429, ErrorCodes.RATE_LIMITED,
                "Too many requests. Please slow down and try again in " + retryAfter + "s.");
        return false;
    }

    private static boolean isProviderCallback(HttpServletRequest request, String path) {
        return MUTATING.contains(request.getMethod()) && PROVIDER_CALLBACKS.contains(path);
    }

    private static boolean isLocalityResolve(HttpServletRequest request, String path) {
        return "POST".equals(request.getMethod()) && Routes.Localities.RESOLVE.equals(path);
    }

    private static boolean isAnonymousPropertyRead(HttpServletRequest request, String path) {
        boolean read = "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
        boolean listings = path.equals(Routes.Properties.BASE) || path.startsWith(Routes.Properties.BASE + "/");
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return read && listings && !(auth != null && auth.getPrincipal() instanceof AuthPrincipal);
    }

    private static boolean isLivingStyleRead(HttpServletRequest request, String path) {
        boolean read = "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
        String[] parts = path.split("/", -1);
        return read && parts.length == 5 && parts[1].equals("flatmates") && parts[4].equals("living-style");
    }

    private static boolean isLimited(HttpServletRequest request, String path) {
        if (MUTATING.contains(request.getMethod())) {
            return true;
        }
        // Not just GET: MVC routes HEAD to @GetMapping handlers, so skipping HEAD bypasses the limit.
        return LIMITED_READS.contains(path);
    }

    private static String path(HttpServletRequest request) {
        return normalisedPath(request.getContextPath(), request.getRequestURI());
    }

    static String normalisedPath(String context, String uri) {
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            uri = uri.substring(context.length());
        }
        String decoded = UriUtils.decode(uri, StandardCharsets.UTF_8);
        int params = decoded.indexOf(';');
        return params < 0 ? decoded : decoded.substring(0, params);
    }

    private String callerKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal principal) {
            return "u:" + principal.userId();
        }
        warnIfProxied(request);
        return "ip:" + anonymousKey(request.getRemoteAddr());
    }

    public static String anonymousKey(String address) {
        if (address == null || address.indexOf(':') < 0 || !isNumericIpv6(address)) {
            return address == null ? "unknown" : address;
        }
        try {
            byte[] bytes = InetAddress.getByName(address).getAddress();
            if (bytes.length != 16) {
                return address;
            }
            StringBuilder prefix = new StringBuilder(23);
            for (int i = 0; i < 8; i++) {
                if (i > 0 && i % 2 == 0) {
                    prefix.append(':');
                }
                prefix.append(String.format("%02x", bytes[i]));
            }
            return prefix.append("::/64").toString();
        } catch (UnknownHostException e) {
            return address;
        }
    }

    private static boolean isNumericIpv6(String address) {
        for (int i = 0; i < address.length(); i++) {
            char c = address.charAt(i);
            boolean allowed = c == ':' || c == '.' || c == '%'
                    || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!allowed) {
                return false;
            }
        }
        return true;
    }

    private void warnIfProxied(HttpServletRequest request) {
        if (proxyAware || misconfigurationLogged || request.getHeader(FORWARDED_FOR) == null) {
            return;
        }
        misconfigurationLogged = true;
        log.error("Request carried {} but draazy.security.trusted-proxies is 'none'. Anonymous "
                + "callers are being rate limited as one bucket keyed on the proxy's address; set "
                + "that property to the proxy's address range.", FORWARDED_FOR);
    }

    Duration window() {
        return window;
    }
}
