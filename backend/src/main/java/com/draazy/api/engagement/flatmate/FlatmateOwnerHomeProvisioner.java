package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.managed.ManagedFlatmateHomes;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserService;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

/** When a flat owner confirms a tenant's room, gives them an account and a private record of the flat to come back to.
 * Never throws: the owner's answer is already recorded and must not be undone by a failure here. */
@Component
class FlatmateOwnerHomeProvisioner {

    private static final Logger log = LoggerFactory.getLogger(FlatmateOwnerHomeProvisioner.class);

    static final String AUDIT_ACTOR = "owner-link";

    private final UserRepository users;
    private final UserService userService;
    private final PlatformSettings settings;
    private final ManagedFlatmateHomes homes;
    private final AuditService audit;

    FlatmateOwnerHomeProvisioner(UserRepository users, UserService userService, PlatformSettings settings,
            ManagedFlatmateHomes homes, AuditService audit) {
        this.users = users;
        this.userService = userService;
        this.settings = settings;
        this.homes = homes;
        this.audit = audit;
    }

    /** The account is made in its own transaction and the home insert rolls back to a savepoint on a database error,
     * so a failure here is logged and the answer stands. */
    void saveHome(FlatmateOwnerNotice notice, FlatmateRoom room) {
        try {
            Optional<User> owner = ownerOf(notice);
            if (owner.isEmpty()) {
                return;
            }
            ManagedFlatmateHomes.Facts facts = new ManagedFlatmateHomes.Facts(room.getId(),
                    notice.getAddressFingerprint(), room.getHomeTypeLabel(), room.getBhk(), room.getLocality(),
                    room.getSociety(), room.getFurnishing());
            homes.register(owner.get().getId(), facts);
        } catch (RuntimeException e) {
            log.warn("Owner home for notice {} was not saved", notice.getId(), e);
        }
    }

    boolean isSaved(FlatmateOwnerNotice notice) {
        return users.findByMobileAndArchivedFalse(notice.getOwnerMobile())
                .filter(owner -> homes.exists(owner.getId(), notice.getAddressFingerprint()))
                .isPresent();
    }

    /** An archived account is never resurrected, and a closed platform makes no new ones. */
    private Optional<User> ownerOf(FlatmateOwnerNotice notice) {
        String mobile = notice.getOwnerMobile();
        Optional<User> existing = users.findByMobile(mobile);
        if (existing.isPresent()) {
            return existing.filter(owner -> !owner.isArchived());
        }
        if (!settings.signupsEnabled()) {
            return Optional.empty();
        }
        User created;
        try {
            created = userService.provisionUnverified(mobile, null);
        } catch (DataIntegrityViolationException race) {
            return users.findByMobileAndArchivedFalse(mobile);
        }
        audit.record(AUDIT_ACTOR, "owner", "user.provision_from_owner_notice", "user", created.getId().toString(),
                Map.of("mobile", MobileMask.mask(mobile), "noticeId", notice.getId().toString()));
        return Optional.of(created);
    }
}
