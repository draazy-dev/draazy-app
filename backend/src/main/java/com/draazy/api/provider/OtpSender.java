package com.draazy.api.provider;

import com.draazy.api.common.error.ServiceUnavailableException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.security.LocalOnly;
import com.draazy.api.security.LocalProfileGuard;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

public interface OtpSender {
    String OPERATION = "otp";

    void send(String mobile, String code);

    class DeliveryFailedException extends ServiceUnavailableException {
        static final int RETRY_AFTER_SECONDS = 60;

        public DeliveryFailedException(String message, Throwable cause) {
            super(message, RETRY_AFTER_SECONDS);
            initCause(cause);
        }
    }
}

@Component
@LocalOnly
@ConditionalOnProperty(prefix = "draazy.providers.whatsapp", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class MockOtpSender implements OtpSender {
    private static final Logger log = LoggerFactory.getLogger(MockOtpSender.class);

    private final ProviderCalls calls;

    MockOtpSender(ProviderCalls calls) {
        this.calls = calls;
    }

    @Override
    public void send(String mobile, String code) {
        log.info("[MOCK OTP] mobile={} code={}", mobile, code);
        calls.record(ProviderCalls.WHATSAPP, OPERATION, ProviderCalls.Outcome.SKIPPED, mobile, null, "mock", null);
    }
}

@Component
@Profile(SandboxOtpSender.PROFILE + " & " + LocalProfileGuard.NOT_LOCAL)
@ConditionalOnProperty(prefix = "draazy.providers.whatsapp", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class SandboxOtpSender implements OtpSender {
    static final String PROFILE = LocalProfileGuard.SANDBOX_PROFILE;

    private static final Logger log = LoggerFactory.getLogger(SandboxOtpSender.class);

    private final ProviderCalls calls;

    SandboxOtpSender(ProviderCalls calls) {
        this.calls = calls;
    }

    @Override
    public void send(String mobile, String code) {
        log.warn("[SANDBOX OTP] mobile={} - not sent; the code is draazy.otp.sandbox-code", MobileMask.mask(mobile));
        calls.record(ProviderCalls.WHATSAPP, OPERATION, ProviderCalls.Outcome.SKIPPED, mobile, null, "sandbox", null);
    }
}

@Component
@Profile(LocalProfileGuard.NOT_LOCAL + " & !" + SandboxOtpSender.PROFILE)
@ConditionalOnProperty(prefix = "draazy.providers.whatsapp", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class UnconfiguredOtpSender implements OtpSender {
    @Override
    public void send(String mobile, String code) {
        throw new UnsupportedOperationException(
                "No OTP provider is configured. Set draazy.providers.whatsapp.enabled=true plus "
                        + "the WHATSAPP_* credentials (ADR-020), or run with the local profile.");
    }
}
