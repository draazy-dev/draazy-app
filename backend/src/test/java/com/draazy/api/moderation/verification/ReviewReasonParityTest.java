package com.draazy.api.moderation.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Review reasons - the modal preview says what the owner is sent")
class ReviewReasonParityTest {

    private static final Path PREVIEW =
            Path.of("..", "frontend", "src", "pages", "admin", "properties", "reviewReasons.js");

    private static final String FINAL_LINE = "\nThis decision is final. The listing cannot be resubmitted.";

    private static final Pattern ENTRY = Pattern.compile(
            "code: '(\\w+)',\\s+label: '[^']*',\\s+ownerMessage: '((?:[^'\\\\]|\\\\.)*)',"
                    + "\\s+rejectionMessage: '((?:[^'\\\\]|\\\\.)*)'");

    @Test
    @DisplayName("every reason code's preview text equals the server's")
    void previewMatchesServerTexts() throws Exception {
        assumeTrue(Files.exists(PREVIEW), "frontend sources not checked out beside the backend");
        Matcher entries = ENTRY.matcher(Files.readString(PREVIEW, StandardCharsets.UTF_8));
        int seen = 0;
        while (entries.find()) {
            String code = entries.group(1);
            assertThat(unescape(entries.group(2))).as("needs_info text of %s", code)
                    .isEqualTo(ReviewReasonCodes.ownerMessage(code, null));
            assertThat(unescape(entries.group(3)) + FINAL_LINE).as("reject text of %s", code)
                    .isEqualTo(ReviewReasonCodes.rejectionMessage(code, null));
            seen++;
        }
        assertThat(seen).as("reason entries parsed").isEqualTo(ReviewReasonCodes.ALL.size());
    }

    private static String unescape(String js) {
        return js.replace("\\'", "'");
    }
}
