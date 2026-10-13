package com.draazy.api.finance.payment;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** The caller's payment history and refund requests (contracts {@code listMyPayments}, {@code requestRefund}). */
@RestController
public class MyPaymentsController {

    private final MyPaymentsService payments;

    public MyPaymentsController(MyPaymentsService payments) {
        this.payments = payments;
    }

    @GetMapping(Routes.Refunds.MY_PAYMENTS)
    public List<MyPaymentDto> mine(@CurrentUser AuthPrincipal principal,
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId) {
        return payments.list(principal, deviceId);
    }

    @PostMapping(Routes.Refunds.MY_REFUND)
    public MyPaymentDto requestRefund(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestBody(required = false) RefundBody body) {
        return payments.requestRefund(principal, id, body == null ? null : body.reason(), idempotencyKey, deviceId);
    }

    public record RefundBody(@Size(max = 500) String reason) {
    }
}