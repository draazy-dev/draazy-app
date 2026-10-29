package com.draazy.api.common.error;

public class OtpIncorrectException extends UnauthorizedException {
    private final int attemptsRemaining;

    public OtpIncorrectException(int attemptsRemaining) {
        super("Incorrect OTP");
        this.attemptsRemaining = Math.max(0, attemptsRemaining);
    }

    public int getAttemptsRemaining() {
        return attemptsRemaining;
    }
}
