package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.error.ConflictException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

@DisplayName("The 409 sub-code marker, as the client parses it")
class FlatmateConflictsTest {
    private static final Pattern CLIENT_MARKER = Pattern.compile("\\s*\\(([a-z_]+)\\)\\s*$");

    private static String subCodeAsClientSeesIt(ConflictException refusal) {
        Matcher hit = CLIENT_MARKER.matcher(refusal.getMessage());
        return hit.find() ? hit.group(1) : null;
    }

    private static Stream<Arguments> refusals() {
        return Stream.of(
                Arguments.of("already_interested",
                        FlatmateConflicts.alreadyInterested("You have already sent this host a request"
                                + " — your earlier message is with them."),
                        FlatmateConflicts.ALREADY_INTERESTED),
                Arguments.of("group_full", FlatmateConflicts.groupFull("This group is full."),
                        FlatmateConflicts.GROUP_FULL));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("refusals")
    @DisplayName("the marker ends the message and the client can read it")
    void markerIsLast(String name, ConflictException refusal, String marker) {
        assertThat(refusal.getMessage())
                .as("the client anchors on the end of the string, so nothing may follow the marker")
                .endsWith("(" + marker + ")");
        assertThat(subCodeAsClientSeesIt(refusal))
                .as("the marker has to survive the client's own pattern, not just an endsWith")
                .isEqualTo(marker);
    }

    @Test
    @DisplayName("the sentence the caller wrote is still in front of the marker, and sloppy spacing is normalised")
    void theProseSurvives() {
        ConflictException refusal = FlatmateConflicts.groupFull("This group is full.");

        assertThat(refusal.getMessage()).startsWith("This group is full.");
        assertThat(refusal.getMessage().replaceAll("\\s*\\([a-z_]+\\)\\s*$", ""))
                .as("what the client renders after stripping the routing token")
                .isEqualTo("This group is full.");
        assertThat(FlatmateConflicts.groupFull("This group is full.   ").getMessage())
                .isEqualTo("This group is full. (group_full)");
    }
}
