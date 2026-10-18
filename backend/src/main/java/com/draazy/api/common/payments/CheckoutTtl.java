package com.draazy.api.common.payments;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// One TTL feeds both the sweep's look-back and Cashfree's order_expiry_time; two copies would drift
// and a customer could pay an order whose row the sweep already retired (a double charge for rent).
@Component
public class CheckoutTtl {

    private static final Logger log = LoggerFactory.getLogger(CheckoutTtl.class);

    static final long DEFAULT_MINUTES = 45;

    // Cashfree rejects an expiry under 15 minutes from receipt; truncation and network time eat into it.
    static final Duration GATEWAY_MINIMUM = Duration.ofMinutes(16);

    private final Duration duration;

    public CheckoutTtl(
            @Value("${draazy.payments.abandoned-checkout-ttl-minutes:" + DEFAULT_MINUTES + "}")
            long ttlMinutes) {
        this.duration = clamp(Duration.ofMinutes(ttlMinutes));
    }

    private static Duration clamp(Duration configured) {
        if (configured.compareTo(GATEWAY_MINIMUM) < 0) {
            log.warn("draazy.payments.abandoned-checkout-ttl-minutes={} is below the {} minute "
                    + "gateway minimum; using {} minutes so the sweep and the gateway order expire "
                    + "together", configured.toMinutes(), GATEWAY_MINIMUM.toMinutes(),
                    GATEWAY_MINIMUM.toMinutes());
            return GATEWAY_MINIMUM;
        }
        return configured;
    }

    public Duration duration() {
        return duration;
    }

    public Instant cutoffFrom(Instant now) {
        return now.minus(duration);
    }

    public Instant expiryFrom(Instant now) {
        return now.plus(duration);
    }
}
