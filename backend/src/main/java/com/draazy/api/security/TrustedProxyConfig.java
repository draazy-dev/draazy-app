package com.draazy.api.security;

import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.apache.catalina.valves.RemoteIpValve;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// Proxy topology is declared in code, not a profile property: an unresolved or empty property
// silently trusts nothing, collapsing anonymous callers into one rate-limit bucket.
@Configuration
public class TrustedProxyConfig {
    private static final Logger log = LoggerFactory.getLogger(TrustedProxyConfig.class);

    static final String NO_PROXY = "none";

    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> remoteIpCustomizer(
            @Value("${draazy.security.trusted-proxies}") String trustedProxies) {
        String value = trustedProxies == null ? "" : trustedProxies.trim();
        if (value.isEmpty()) {
            throw new IllegalStateException(
                    "draazy.security.trusted-proxies must be set. Use 'none' if this instance is "
                            + "directly exposed, or a regex matching the load balancer's addresses. "
                            + "Leaving it blank would key every anonymous caller on the proxy's "
                            + "address, so one host could rate-limit the entire platform.");
        }

        if (NO_PROXY.equalsIgnoreCase(value)) {
            log.info("Trusted proxies: none. Client addresses are read from the socket.");
            return factory -> { };
        }

        try {
            Pattern.compile(value);
        } catch (PatternSyntaxException e) {
            throw new IllegalStateException(
                    "draazy.security.trusted-proxies is not a valid regex: " + value, e);
        }

        log.info("Trusted proxies: {}. Client addresses are read from X-Forwarded-For for peers "
                + "matching that pattern, and from the socket for everyone else.", value);
        return factory -> {
            RemoteIpValve valve = new RemoteIpValve();
            valve.setInternalProxies(value);
            factory.addEngineValves(valve);
        };
    }
}
