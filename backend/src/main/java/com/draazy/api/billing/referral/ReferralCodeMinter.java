package com.draazy.api.billing.referral;

import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class ReferralCodeMinter {
    private static final String CODE_PREFIX = "PUNE-";

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private static final int CODE_LENGTH = 6;

    private static final int CODE_ATTEMPTS = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ReferralCodeRepository codes;
    private final ReferralSignals signals;

    ReferralCodeMinter(ReferralCodeRepository codes, ReferralSignals signals) {
        this.codes = codes;
        this.signals = signals;
    }

    String codeFor(UUID userId, HttpServletRequest request) {
        ReferralSignals.Signals observed = signals.of(request);
        Optional<ReferralCode> existing = codes.findById(userId);
        if (existing.isPresent()) {
            existing.get().refresh(observed);
            return existing.get().getCode();
        }
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            String candidate = generateCode();
            if (!codes.existsByCode(candidate)) {
                return codes.saveAndFlush(new ReferralCode(userId, candidate, observed)).getCode();
            }
        }
        throw new IllegalStateException("Could not mint a unique referral code for " + userId);
    }

    private static String generateCode() {
        StringBuilder code = new StringBuilder(CODE_PREFIX);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return code.toString();
    }
}
