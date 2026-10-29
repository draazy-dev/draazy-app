package com.draazy.api.identity.auth;

import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.OtpIncorrectException;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.provider.OtpSender;
import com.draazy.api.security.LocalProfileGuard;
import jakarta.annotation.PostConstruct;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OtpService {
    static final Duration TTL = Duration.ofMinutes(5);

    static final int DEFAULT_MAX_VERIFY_ATTEMPTS = 3;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final OtpCodeRepository repository;
    private final OtpSender sender;

    private final OtpSendBudget budget;

    private final String fixedCode;

    private static final String SANDBOX_PROFILE = LocalProfileGuard.SANDBOX_PROFILE;

    private final String sandboxCode;

    private final Environment environment;

    private final int maxVerifyAttempts;

    public OtpService(OtpCodeRepository repository, OtpSender sender, OtpSendBudget budget,
            Environment environment,
            @Value("${draazy.otp.fixed-code:}") String fixedCode,
            @Value("${draazy.otp.sandbox-code:}") String sandboxCode,
            @Value("${draazy.otp.max-verify-attempts:" + DEFAULT_MAX_VERIFY_ATTEMPTS + "}")
                    int maxVerifyAttempts) {
        this.repository = repository;
        this.sender = sender;
        this.budget = budget;
        this.environment = environment;
        this.fixedCode = fixedCode == null ? "" : fixedCode.trim();
        this.sandboxCode = sandboxCode == null ? "" : sandboxCode.trim();
        this.maxVerifyAttempts = maxVerifyAttempts;
    }

    int maxVerifyAttempts() {
        return maxVerifyAttempts;
    }

    public int resendCooldownSeconds() {
        return budget.sendCooldownSeconds();
    }

    @PostConstruct
    void rejectUnusableAttemptCap() {
        if (maxVerifyAttempts < 1 || maxVerifyAttempts > 20) {
            throw new IllegalStateException(
                    "draazy.otp.max-verify-attempts is " + maxVerifyAttempts
                            + ", which must be between 1 and 20. Below 1 every code is burned on its "
                            + "first use and nobody can sign in; above 20 the per-code guess ceiling "
                            + "stops being a brute-force defence.");
        }
    }

    @PostConstruct
    void rejectFixedCodeInProduction() {
        String profile = LocalProfileGuard.activeDeploymentProfile(environment);
        if (!fixedCode.isEmpty() && profile != null) {
            throw new IllegalStateException(
                    "draazy.otp.fixed-code is set while the '" + profile + "' profile is active. "
                            + "This makes every login code predictable. Unset it (check E2E_OTP_CODE "
                            + "and DRAAZY_OTP_FIXED_CODE in the process environment, not only the "
                            + "properties files) or drop the '" + profile + "' profile.");
        }
    }

    @PostConstruct
    void rejectSandboxCodeOutsideSandbox() {
        if (sandboxCode.isEmpty()) {
            return;
        }
        String conflicting = null;
        for (String deployment : LocalProfileGuard.DEPLOYMENT_PROFILES) {
            if (!SANDBOX_PROFILE.equals(deployment) && environment.matchesProfiles(deployment)) {
                conflicting = deployment;
            }
        }
        if (conflicting != null || !environment.matchesProfiles(SANDBOX_PROFILE)) {
            throw new IllegalStateException(
                    "draazy.otp.sandbox-code is set, but the active profiles are not '"
                            + SANDBOX_PROFILE + "' alone"
                            + (conflicting == null ? "" : " ('" + conflicting + "' is also active)")
                            + ". This makes every login code predictable. Unset it (check "
                            + "DRAAZY_OTP_SANDBOX_CODE in the process environment, not only the "
                            + "properties files), or activate '" + SANDBOX_PROFILE + "' on its own.");
        }
    }

    @PostConstruct
    void rejectPresetCodeOverLiveWhatsApp() {
        boolean whatsAppLive = environment.getProperty(
                "draazy.providers.whatsapp.enabled", Boolean.class, false);
        if (!whatsAppLive || (fixedCode.isEmpty() && sandboxCode.isEmpty())) {
            return;
        }
        String key = fixedCode.isEmpty() ? "draazy.otp.sandbox-code" : "draazy.otp.fixed-code";
        throw new IllegalStateException(
                key + " is set while WhatsApp delivery is live (WHATSAPP_ENABLED=true), so every "
                        + "login code sent to a real phone is the same. Unset WHATSAPP_ENABLED to use "
                        + "the preset code, or unset the code (LOCAL_OTP_CODE, E2E_OTP_CODE, "
                        + "DRAAZY_OTP_FIXED_CODE, DRAAZY_OTP_SANDBOX_CODE) to send random codes.");
    }

    @Transactional(noRollbackFor = {RateLimitedException.class,
            OtpSender.DeliveryFailedException.class})
    public void sendLoginCode(String mobile) {
        sendSelfServiceCode(mobile, OtpCode.PURPOSE_LOGIN);
    }

    @Transactional(noRollbackFor = {RateLimitedException.class,
            OtpSender.DeliveryFailedException.class})
    public void sendSelfServiceCode(String mobile, String purpose) {
        sendCode(mobile, purpose, null);
    }

    @Transactional(noRollbackFor = {RateLimitedException.class,
            OtpSender.DeliveryFailedException.class})
    public void sendCode(String mobile, String purpose, UUID requestedBy) {
        budget.enforce(mobile, purpose, requestedBy);

        String preset = fixedCode.isEmpty() ? sandboxCode : fixedCode;
        String code = preset.isEmpty()
                ? String.format("%06d", RANDOM.nextInt(1_000_000))
                : preset;
        repository.save(new OtpCode(mobile, Tokens.sha256Hex(code), purpose,
                Instant.now().plus(TTL), requestedBy));

        sender.send(mobile, code);
    }

    // The attempt bookkeeping must survive the thrown 401/429, hence noRollbackFor.
    @Transactional(noRollbackFor = {UnauthorizedException.class, RateLimitedException.class})
    public void verifyLoginCode(String mobile, String code) {
        verifyCode(mobile, code, OtpCode.PURPOSE_LOGIN);
    }

    @Transactional(noRollbackFor = {UnauthorizedException.class, RateLimitedException.class})
    public void verifyCode(String mobile, String code, String purpose) {
        OtpCode otp = repository
                .findFirstByMobileAndPurposeAndConsumedFalseOrderByCreatedAtDesc(
                        mobile, purpose)
                .orElseThrow(() -> new UnauthorizedException("No active OTP — request a new code"));

        if (otp.isExpired()) {
            throw new UnauthorizedException("OTP expired — request a new code");
        }
        if (otp.getAttempts() >= maxVerifyAttempts) {
            otp.consume();
            throw new RateLimitedException(ErrorCodes.OTP_ATTEMPTS_EXHAUSTED,
                    "Too many attempts — request a new code", 0);
        }

        if (!Tokens.hashesEqual(Tokens.sha256Hex(code), otp.getCodeHash())) {
            otp.recordAttempt();

            throw new OtpIncorrectException(maxVerifyAttempts - otp.getAttempts());
        }
        otp.consume();
    }
}
