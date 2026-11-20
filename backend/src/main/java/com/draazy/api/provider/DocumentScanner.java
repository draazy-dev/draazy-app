package com.draazy.api.provider;

public interface DocumentScanner {
    Verdict scan(String fileName, String contentType, byte[] content);

    record Verdict(Outcome outcome, String detail) {
        public enum Outcome {
            CLEAN,
            TOO_LARGE,
            REJECTED
        }

        private static final Verdict CLEAN = new Verdict(Outcome.CLEAN, null);

        public static Verdict clean() {
            return CLEAN;
        }

        public static Verdict tooLarge(String detail) {
            return new Verdict(Outcome.TOO_LARGE, detail);
        }

        public static Verdict rejected(String detail) {
            return new Verdict(Outcome.REJECTED, detail);
        }

        public boolean isClean() {
            return outcome == Outcome.CLEAN;
        }
    }
}
