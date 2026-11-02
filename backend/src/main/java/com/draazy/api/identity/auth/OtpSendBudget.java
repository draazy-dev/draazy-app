package com.draazy.api.identity.auth;

import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.persistence.RateLimitLock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
public class OtpSendBudget {
    static final Duration SEND_WINDOW = Duration.ofHours(1);

    static final Duration SEND_DAY = Duration.ofDays(1);

    static final int MAX_PURPOSE_RESERVE_SENDS_PER_WINDOW = 50;

    private static final int LOCK_CONTENTION_RETRY_SECONDS = 5;

    private final OtpCodeRepository repository;
    private final RateLimitLock locks;
    private final Duration sendCooldown;
    private final int maxSendsPerWindow;
    private final int maxSendsPerDay;
    private final int maxPlatformSendsPerWindow;
    private final int maxPurposeSendsPerWindow;
    private final int maxCallerSendsPerWindow;

    public OtpSendBudget(OtpCodeRepository repository, RateLimitLock locks,
            @Value("${draazy.otp.send-cooldown-seconds:60}") long sendCooldownSeconds,
            @Value("${draazy.otp.max-sends-per-window:5}") int maxSendsPerWindow,
            @Value("${draazy.otp.max-sends-per-day:10}") int maxSendsPerDay,
            @Value("${draazy.otp.max-platform-sends-per-window:500}") int maxPlatformSendsPerWindow,
            @Value("${draazy.otp.max-purpose-sends-per-window:100}") int maxPurposeSendsPerWindow,
            @Value("${draazy.otp.max-caller-sends-per-window:5}") int maxCallerSendsPerWindow) {
        this.repository = repository;
        this.locks = locks;
        this.sendCooldown = Duration.ofSeconds(sendCooldownSeconds);
        this.maxSendsPerWindow = maxSendsPerWindow;
        this.maxSendsPerDay = maxSendsPerDay;
        this.maxPlatformSendsPerWindow = maxPlatformSendsPerWindow;
        this.maxPurposeSendsPerWindow = maxPurposeSendsPerWindow;
        this.maxCallerSendsPerWindow = maxCallerSendsPerWindow;
    }

    int sendCooldownSeconds() {
        return (int) sendCooldown.toSeconds();
    }

    void enforce(String mobile, String purpose, UUID requestedBy) {
        String family = family(purpose);
        locks.holdUntilCommit(RateLimitLock.Limit.OTP_SEND, mobile + ":" + family);
        if (requestedBy != null && !locks.tryHoldUntilCommit(
                RateLimitLock.Limit.OTP_SEND_CALLER, requestedBy + ":" + family)) {
            throw new RateLimitedException(
                    "A code you asked for is still being sent — wait for it before asking again",
                    LOCK_CONTENTION_RETRY_SECONDS);
        }
        enforcePlatformBudget();
        enforcePurposeBudget(family, requestedBy);
        enforceCallerBudget(requestedBy, family);
        List<Instant> recent = repository.findRecentSendTimesForRecipient(
                mobile, family, PageRequest.of(0, Math.max(maxSendsPerWindow, maxSendsPerDay)));
        if (recent.isEmpty()) {
            return;
        }
        Instant now = Instant.now();
        Instant readyAt = recent.get(0).plus(sendCooldown);
        Instant capFreesAt = now;
        if (recent.size() >= maxSendsPerWindow) {
            capFreesAt = latest(capFreesAt, recent.get(maxSendsPerWindow - 1).plus(SEND_WINDOW));
        }
        if (recent.size() >= maxSendsPerDay) {
            capFreesAt = latest(capFreesAt, recent.get(maxSendsPerDay - 1).plus(SEND_DAY));
        }
        if (now.isBefore(capFreesAt)) {
            throw new RateLimitedException(
                    "Too many login codes requested for this number — try again later",
                    secondsUntil(now, latest(capFreesAt, readyAt)));
        }
        if (now.isBefore(readyAt)) {
            throw new RateLimitedException(
                    "A code was just sent — wait a moment before requesting another",
                    secondsUntil(now, readyAt));
        }
    }

    private static Instant latest(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private void enforcePlatformBudget() {
        Instant now = Instant.now();
        List<Instant> sends = repository.findSendTimesSince(
                now.minus(SEND_WINDOW), PageRequest.of(0, maxPlatformSendsPerWindow));
        if (sends.size() < maxPlatformSendsPerWindow) {
            return;
        }
        refuseUntilWindowFrees(now, sends.get(0),
                "Login codes are temporarily unavailable — please try again later");
    }

    private void enforcePurposeBudget(String family, UUID requestedBy) {
        if (OtpCode.PURPOSE_LOGIN.equals(family)) {
            return;
        }
        Instant now = Instant.now();
        Instant since = now.minus(SEND_WINDOW);
        List<Instant> sends = repository.findSendTimesForPurposeSince(
                family, since, PageRequest.of(0, purposeReserveCeiling()));
        if (sends.size() < maxPurposeSendsPerWindow) {
            return;
        }
        if (requestedBy != null && sends.size() < purposeReserveCeiling()
                && hasSpentNothing(requestedBy, family, since)) {
            return;
        }
        refuseUntilWindowFrees(now, sends.get(sends.size() - maxPurposeSendsPerWindow),
                "Codes for this are temporarily unavailable — please try again later");
    }

    private void enforceCallerBudget(UUID requestedBy, String family) {
        if (requestedBy == null || OtpCode.PURPOSE_LOGIN.equals(family)) {
            return;
        }
        Instant now = Instant.now();
        List<Instant> sends = repository.findSendTimesForCallerSince(requestedBy, family,
                now.minus(SEND_WINDOW), PageRequest.of(0, maxCallerSendsPerWindow));
        if (sends.size() < maxCallerSendsPerWindow) {
            return;
        }
        refuseUntilWindowFrees(now, sends.get(0),
                "You have requested too many codes — try again later");
    }

    private static void refuseUntilWindowFrees(Instant now, Instant oldest, String message) {
        Instant windowFreesAt = oldest.plus(SEND_WINDOW);
        if (now.isBefore(windowFreesAt)) {
            throw new RateLimitedException(message, secondsUntil(now, windowFreesAt));
        }
    }

    private int purposeReserveCeiling() {
        return maxPurposeSendsPerWindow + MAX_PURPOSE_RESERVE_SENDS_PER_WINDOW;
    }

    private boolean hasSpentNothing(UUID requestedBy, String family, Instant since) {
        return repository.findSendTimesForCallerSince(
                requestedBy, family, since, PageRequest.of(0, 1)).isEmpty();
    }

    private static String family(String purpose) {
        int scope = purpose.indexOf(':');
        return scope < 0 ? purpose : purpose.substring(0, scope);
    }

    private static int secondsUntil(Instant now, Instant target) {
        long millis = Duration.between(now, target).toMillis();
        return (int) Math.max(1, (millis + 999) / 1000);
    }
}
