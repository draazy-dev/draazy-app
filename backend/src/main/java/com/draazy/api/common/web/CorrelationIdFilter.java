package com.draazy.api.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/** Gives every request a correlation id (an inbound safe {@code X-Trace-Id} or a new UUID) in the MDC, echoed in the
 * response header, and logs one outcome line per request. Runs before Spring Security so 401/403 carry it too. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(CorrelationIdFilter.class);

    private static final long SLOW_REQUEST_MS = 2_000;

    /** Rejects CR/LF and exotic characters so a reflected header cannot split the response or forge a log line. */
    private static final Pattern SAFE_TRACE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,128}$");

    /** Reserved for scheduled runs; a caller sending it would file its errors under jobs. */
    private static final String JOB_TRACE_PREFIX = "job-";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String traceId = request.getHeader(RequestCorrelation.TRACE_ID_HEADER);
        if (!StringUtils.hasText(traceId) || !SAFE_TRACE_ID.matcher(traceId).matches()
                || traceId.startsWith(JOB_TRACE_PREFIX)) {
            traceId = UUID.randomUUID().toString();
        }
        MDC.put(RequestCorrelation.TRACE_ID_MDC, traceId);
        MDC.put(RequestCorrelation.METHOD_MDC, request.getMethod());
        MDC.put(RequestCorrelation.PATH_MDC, request.getRequestURI());
        response.setHeader(RequestCorrelation.TRACE_ID_HEADER, traceId);
        long started = System.nanoTime();
        int status = HttpServletResponse.SC_INTERNAL_SERVER_ERROR;
        try {
            chain.doFilter(request, response);
            status = response.getStatus();
        } finally {
            logOutcome(request, status, (System.nanoTime() - started) / 1_000_000L);
            MDC.remove(RequestCorrelation.TRACE_ID_MDC);
            MDC.remove(RequestCorrelation.METHOD_MDC);
            MDC.remove(RequestCorrelation.PATH_MDC);
            MDC.remove(RequestCorrelation.USER_ID_MDC);
            MDC.remove(RequestCorrelation.USER_ROLE_MDC);
        }
    }

    // Never the query string, headers or body: a query can carry a share token.
    private static void logOutcome(HttpServletRequest request, int status, long millis) {
        if (status >= 500 || millis > SLOW_REQUEST_MS) {
            log.warn("{} {} -> {} in {} ms", request.getMethod(), request.getRequestURI(), status, millis);
        } else if (log.isDebugEnabled()) {
            log.debug("{} {} -> {} in {} ms", request.getMethod(), request.getRequestURI(), status, millis);
        }
    }
}
