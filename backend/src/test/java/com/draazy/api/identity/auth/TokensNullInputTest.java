package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class TokensNullInputTest {
    @Test
    void sha256OfNullFailsFastWithANamedNullPointer() {
        assertThatThrownBy(() -> Tokens.sha256Hex(null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("token");
    }

    @Test
    void hashesEqualStillRejectsNull() {
        assertThatThrownBy(() -> Tokens.hashesEqual(null, "x")).isInstanceOf(NullPointerException.class);
    }
}
