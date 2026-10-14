package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** A paid callback whose sum or currency is not the order's is not settled; admins refund it from the gateway. */
@Component
class ServiceRequestAmountGuard {

    private static final Logger log = LoggerFactory.getLogger(ServiceRequestAmountGuard.class);

    private static final String CURRENCY = "INR";

    private final AuditService audit;
    private final UserRepository users;
    private final Notifier notifier;

    ServiceRequestAmountGuard(AuditService audit, UserRepository users, Notifier notifier) {
        this.audit = audit;
        this.users = users;
        this.notifier = notifier;
    }

    /** An absent amount or currency is not a mismatch; the audit entry and the admin notice are once per order. */
    boolean refuses(String orderId, UUID requestId, Long expected, BigDecimal paid, String currency) {
        boolean wrongCurrency = currency != null && !currency.isBlank() && !CURRENCY.equalsIgnoreCase(currency);
        boolean wrongAmount = paid != null && expected != null && paid.compareTo(BigDecimal.valueOf(expected)) != 0;
        if (!wrongCurrency && !wrongAmount) {
            return false;
        }
        log.warn("Order {} on service request {} was billed {} {} but the provider reports {} {}; not settled.",
                orderId, requestId, expected, CURRENCY, paid, currency);
        if (audit.recordOnce("system", "admin", "serviceRequest.amountMismatch", "payment_order", orderId,
                Map.of("request", requestId.toString(), "expected", String.valueOf(expected),
                        "paid", String.valueOf(paid), "currency", String.valueOf(currency)))) {
            String shown = currency == null || currency.isBlank() ? CURRENCY : currency;
            String body = "Order " + orderId + " was billed " + expected + " " + CURRENCY + " but "
                    + paid + " " + shown + " was paid. Refund it from the gateway dashboard.";
            users.findLiveByRole(Roles.Wire.ADMIN).forEach(admin -> notifier.notify(admin.getId(),
                    "service.amount-mismatch", "Payment does not match its order", body, "/admin/finance"));
        }
        return true;
    }
}
