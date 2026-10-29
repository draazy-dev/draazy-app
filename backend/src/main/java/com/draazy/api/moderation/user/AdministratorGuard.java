package com.draazy.api.moderation.user;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import jakarta.persistence.EntityManager;
import jakarta.persistence.FlushModeType;
import jakarta.persistence.Query;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AdministratorGuard {
    // One global advisory-lock key: two admins archiving each other would both pass a per-account check.
    private static final long FLOOR_LOCK = 0xD200L;

    private final UserRepository users;
    private final EntityManager em;

    public AdministratorGuard(UserRepository users, EntityManager em) {
        this.users = users;
        this.em = em;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void refuseIfLastAdministrator(User target) {
        if (!Roles.Wire.ADMIN.equals(target.getRole())) {
            return;
        }
        holdFloorUntilCommit();
        if (!isCapable(target) || anotherCapableAdministratorExists(target.getId())) {
            return;
        }
        throw new ConflictException(
                "This is the last active administrator. "
                        + "Appoint another administrator first, "
                        + "otherwise nobody would be able to hand access back.");
    }

    private void holdFloorUntilCommit() {
        Query query = em.createNativeQuery(
                "select 1 from (select pg_advisory_xact_lock(:lockId)) as acquired");
        query.setFlushMode(FlushModeType.COMMIT);
        query.setParameter("lockId", FLOOR_LOCK);
        query.getSingleResult();
    }

    private boolean anotherCapableAdministratorExists(UUID excluding) {
        return users.findLiveByRole(Roles.Wire.ADMIN).stream()
                .filter(candidate -> !candidate.getId().equals(excluding))
                .anyMatch(this::isCapable);
    }

    private boolean isCapable(User candidate) {
        return Roles.Wire.ADMIN.equals(candidate.getRole()) && !candidate.isArchived();
    }
}
