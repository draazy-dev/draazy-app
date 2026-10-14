package com.draazy.api.identity.auth;

import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.security.WriteRateLimitFilter;
import com.draazy.api.security.WriteRateLimitStore;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Caps anonymous login-code send attempts per address: every {@link OtpSendBudget} key rotates with the
 * number. Kept loose because Indian mobile carriers put many subscribers behind one IPv4 address. */
@Component
public class OtpSendIpBudget {

    private final WriteRateLimitStore store;

    public OtpSendIpBudget(WriteRateLimitStore.Factory stores,
            @Value("${draazy.otp.max-sends-per-ip-per-window:20}") int maxSendsPerIp) {
        this.store = stores.create("otp-ip", maxSendsPerIp, OtpSendBudget.SEND_WINDOW);
    }

    void enforce(HttpServletRequest request) {
        int retryAfter = store.tryAcquire(
                WriteRateLimitFilter.anonymousKey(request.getRemoteAddr()), Instant.now());
        if (retryAfter > 0) {
            throw new RateLimitedException(
                    "Too many login codes requested from this network — try again later", retryAfter);
        }
    }
}
