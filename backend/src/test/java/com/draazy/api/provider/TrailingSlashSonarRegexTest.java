package com.draazy.api.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Trailing-slash trimming — linear form agrees with replaceAll(\"/+$\", \"\")")
class TrailingSlashSonarRegexTest {
    private static final String ORIGINAL = "/+$";
    private static final String LINEAR = "([^/]|^)/++$";

    private static String original(String input) {
        return input.replaceAll(ORIGINAL, "");
    }

    private static String linear(String input) {
        return input.replaceAll(LINEAR, "$1");
    }

    private static String gatewayBase(String base) throws ReflectiveOperationException {
        Method method = CashfreePaymentGateway.class.getDeclaredMethod("httpsOrBlank", String.class);
        method.setAccessible(true);
        return (String) method.invoke(null, base);
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        for (String input : RegexOracle.corpus("a/:.\n\r", 12, 60000, 91L)) {
            assertThat(linear(input)).as("input [%s]", input.replace("\n", "\\n").replace("\r", "\\r"))
                    .isEqualTo(original(input));
        }
        for (String input : List.of("", "/", "//", "a/", "a//", "/a", "/a/", "a/\n", "a//\n", "a/\r\n", "a/\n/",
                "/\n", "///\n\n", "https://x.in/", "https://x.in///", "https://x.in//a", "\u0085/", "a/\u2028")) {
            assertThat(linear(input)).isEqualTo(original(input));
        }
    }

    @Test
    void longInputsStayLinear() {
        RegexOracle.assertQuick(() -> {
            assertThat(linear("https://x.in" + "/".repeat(200_000))).isEqualTo("https://x.in");
            assertThat(linear("/".repeat(200_000))).isEmpty();
            assertThat(linear("/".repeat(200_000) + "a")).isEqualTo("/".repeat(200_000) + "a");
            assertThat(linear("a/".repeat(100_000))).isEqualTo("a/".repeat(99_999) + "a");
        });
    }

    @Test
    void paymentGatewayReturnBaseDropsTrailingSlashesOnly() throws Exception {
        assertThat(gatewayBase("https://draazy.in///")).isEqualTo("https://draazy.in");
        assertThat(gatewayBase("  https://draazy.in/app/ ")).isEqualTo("https://draazy.in/app");
        assertThat(gatewayBase("http://draazy.in/")).isEmpty();
        assertThat(gatewayBase(null)).isEmpty();
    }
}
