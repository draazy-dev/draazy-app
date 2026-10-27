package com.draazy.api.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** The default bean when Turnstile is off, so the disabled path runs constantly rather than hiding behind a
 * null check; see {@link BotDefence} for why "not configured" fails open. */
@Component
@ConditionalOnProperty(prefix = "draazy.security.turnstile", name = "enabled",
        havingValue = "false", matchIfMissing = true)
public class NoopBotDefence implements BotDefence {

    // Live WhatsApp makes each anonymous POST /auth/login a paid send, so a deployment must not drop the challenge.
    public NoopBotDefence(Environment environment) {
        String profile = LocalProfileGuard.activeDeploymentProfile(environment);
        if (profile != null && environment.getProperty("draazy.providers.whatsapp.enabled", Boolean.class, false)) {
            throw new IllegalStateException("WhatsApp delivery is live (WHATSAPP_ENABLED=true) on the '" + profile
                    + "' profile but Turnstile is off. Set TURNSTILE_ENABLED=true and TURNSTILE_SECRET_KEY, "
                    + "or unset WHATSAPP_ENABLED.");
        }
    }

    @Override
    public boolean enforced() {
        return false;
    }

    // Never called (BotDefenceFilter checks enforced() first); true so a caller that forgets fails open, as intended.
    @Override
    public boolean verify(String token, String remoteIp) {
        return true;
    }
}
