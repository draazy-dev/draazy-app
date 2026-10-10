package com.draazy.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatNoException;

import com.draazy.api.common.persistence.DatabasePrivilegeCheck.Grants;
import org.junit.jupiter.api.Test;

class DatabasePrivilegeCheckTest {

    private static final Grants LEAST = new Grants(false, false, false);

    @Test
    void aDmlOnlyRuntimeRolePasses() {
        assertThat(LEAST.problems()).isEmpty();
        assertThatNoException().isThrownBy(() -> DatabasePrivilegeCheck.judge(LEAST, "draazy_app.ref", "postgres.ref"));
    }

    @Test
    void anElevatedRuntimeRoleRefusesTheBootOnceFlywayHasItsOwnUser() {
        Grants owner = new Grants(true, true, true);

        assertThat(owner.problems()).hasSize(3);
        assertThatIllegalStateException()
                .isThrownBy(() -> DatabasePrivilegeCheck.judge(owner, "draazy_app.ref", "postgres.ref"))
                .withMessageContaining("docs/DEPLOY.md §2.1");
    }

    @Test
    void sharingTheFlywayUserOnlyWarnsSoTheRolloutCanDeployBeforeTheSplit() {
        Grants owner = new Grants(true, false, true);

        assertThatNoException().isThrownBy(() -> DatabasePrivilegeCheck.judge(owner, "postgres.ref", "postgres.ref"));
    }

    @Test
    void anyOneElevationIsEnough() {
        assertThat(new Grants(false, true, false).problems()).containsExactly("may CREATE in schema public");
        assertThat(new Grants(false, false, true).problems()).containsExactly("owns tables in schema public");
    }
}
