package com.draazy.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.draazy.api.common.persistence.RateLimitLock.Limit;
import jakarta.persistence.EntityManager;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("RateLimitLock — the guarantees a race test cannot see")
class RateLimitLockTest {
    @Test
    @DisplayName("no two limits can produce the same lock id, even for an identical key")
    void namespacesCannotCollide() {
        Set<Long> ids = new HashSet<>();
        for (Limit limit : Limit.values()) {
            ids.add(RateLimitLock.lockId(limit, "9876500073"));
        }
        assertThat(ids)
                .as("each Limit must occupy its own 32-bit namespace")
                .hasSize(Limit.values().length);
    }

    @Test
    @DisplayName("a key that hashes negative stays inside its own namespace")
    void negativeHashesStayInTheirNamespace() {
        String negative = "9876500073";
        assertThat(negative.hashCode()).isNegative();

        long id = RateLimitLock.lockId(Limit.OTP_SEND, negative);

        assertThat(id >>> 32)
                .as("the high half is the namespace and nothing else")
                .isEqualTo(1L);
        assertThat(RateLimitLock.lockId(Limit.FLATMATE_INTEREST, negative) >>> 32)
                .isEqualTo(3L);
    }

    @Test
    @DisplayName("the same limit and key always give the same id")
    void theIdIsStable() {
        assertThat(RateLimitLock.lockId(Limit.FLATMATE_INTEREST, "abc"))
                .isEqualTo(RateLimitLock.lockId(Limit.FLATMATE_INTEREST, "abc"));
    }

    @Test
    @DisplayName("refuses to run outside a transaction rather than silently guarding nothing")
    void refusesWithoutATransaction() {
        EntityManager em = mock(EntityManager.class);

        assertThatThrownBy(() -> new RateLimitLock(em).holdUntilCommit(Limit.OTP_SEND, "9876500073"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("active transaction");

        verifyNoInteractions(em);
    }
}
