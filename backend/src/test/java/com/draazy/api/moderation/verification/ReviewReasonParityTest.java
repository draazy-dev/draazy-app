package com.draazy.api.moderation.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Review reasons - the modal preview says what the owner is sent")
class ReviewReasonParityTest {

    private static final Path PREVIEW =
            Path.of("..", "frontend", "src", "pages", "admin", "properties", "reviewReasons.js");

    private static final String FINAL_LINE = "\nThis decision is final. The listing cannot be resubmitted.";
    private static final String RESUBMIT_LINE = "\nEdit the listing and resubmit it for review.";

    private static final Pattern ENTRY = Pattern.compile(
            "code: '(\\w+)',\\s+label: '[^']*',\\s+ownerMessage: '((?:[^'\\\\]|\\\\.)*)',"
                    + "\\s+rejectionMessage: '((?:[^'\\\\]|\\\\.)*)',(\\s+resubmittable: true,)?");

    @Test
    @DisplayName("every reason code's preview text equals the server's")
    void previewMatchesServerTexts() throws Exception {
        assumeTrue(Files.exists(PREVIEW), "frontend sources not checked out beside the backend");
        Matcher entries = ENTRY.matcher(Files.readString(PREVIEW, StandardCharsets.UTF_8));
        int seen = 0;
        Set<String> resubmittable = new HashSet<>();
        while (entries.find()) {
            String code = entries.group(1);
            assertThat(unescape(entries.group(2))).as("needs_info text of %s", code)
                    .isEqualTo(ReviewReasonCodes.ownerMessage(code, null));
            boolean fixable = entries.group(4) != null;
            if (fixable) {
                resubmittable.add(code);
            }
            assertThat(unescape(entries.group(3)) + (fixable ? RESUBMIT_LINE : FINAL_LINE))
                    .as("reject text of %s", code)
                    .isEqualTo(ReviewReasonCodes.rejectionMessage(code, null));
            seen++;
        }
        assertThat(seen).as("reason entries parsed").isEqualTo(ReviewReasonCodes.ALL.size());
        assertThat(resubmittable).as("entries marked resubmittable").isEqualTo(ReviewReasonCodes.RESUBMITTABLE);
    }

    @Test
    @DisplayName("the resubmittable reasons are exactly the five fixable ones and all are known codes")
    void resubmittableReasonsAreTheFixableOnes() {
        assertThat(ReviewReasonCodes.RESUBMITTABLE).containsExactlyInAnyOrder("photos_not_real", "wrong_details",
                "locality_unclear", "document_unreadable", "name_mismatch");
        assertThat(ReviewReasonCodes.ALL).containsAll(ReviewReasonCodes.RESUBMITTABLE);
        assertThat(ReviewReasonCodes.rejectionThread("duplicate", null)).endsWith(FINAL_LINE);
        assertThat(ReviewReasonCodes.rejectionThread("wrong_details", "Rent is wrong")).endsWith(RESUBMIT_LINE);
    }

    private static String unescape(String js) {
        return js.replace("\\'", "'");
    }
}
