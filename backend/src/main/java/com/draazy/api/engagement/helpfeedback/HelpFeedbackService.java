package com.draazy.api.engagement.helpfeedback;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HelpFeedbackService {
    static final int DAILY_IP_SLUG_LIMIT = 20;

    private static final Pattern CONTROL_CHARS =
            Pattern.compile("[\\p{Cntrl}\\u0080-\\u009F\\u0085\\u2028\\u2029&&[^\t\n]]");

    private final HelpFeedbackRepository repository;

    public HelpFeedbackService(HelpFeedbackRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void record(HelpFeedbackCreate body, AuthPrincipal principal, String remoteAddress) {
        String ipHash = hashIp(remoteAddress);
        Instant dayStart = LocalDate.now(PlatformTime.IST)
                .atStartOfDay(PlatformTime.IST)
                .toInstant();
        if (repository.countBySlugAndIpHashAndCreatedAtAfter(
                body.slug(), ipHash, dayStart) >= DAILY_IP_SLUG_LIMIT) {
            return;
        }
        UUID userId = principal == null ? null : principal.userId();
        repository.upsert(body.slug(), body.lang(), body.helpful(), blankToNull(body.comment()), userId,
                ipHash, voterKey(userId, body.voter(), ipHash));
    }

    private static String voterKey(UUID userId, String voter, String ipHash) {
        if (userId != null) {
            return userId.toString();
        }
        return voter == null ? ipHash : "b:" + voter.toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = CONTROL_CHARS.matcher(raw).replaceAll("").trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static String hashIp(String remoteAddress) {
        return Tokens.sha256Hex("help-feedback:" + (remoteAddress == null ? "" : remoteAddress));
    }
}
