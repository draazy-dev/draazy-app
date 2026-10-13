package com.draazy.api.billing.refund;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.BackOfficePermissions;
import org.springframework.stereotype.Component;

/** Tells whoever holds the {@code refunds} back-office function, and the administrator, that money needs a look. */
@Component
public class RefundStaffAlerts {

    private static final String DESK_LINK = "/admin/refunds";

    private final UserRepository users;
    private final AccountPermissions permissions;
    private final Notifier notifier;

    public RefundStaffAlerts(UserRepository users, AccountPermissions permissions, Notifier notifier) {
        this.users = users;
        this.permissions = permissions;
        this.notifier = notifier;
    }

    public void notifyHolders(String type, String title, String body) {
        for (User account : users.findBackOfficeAccounts()) {
            if (!account.isArchived()
                    && permissions.effectiveFor(account.getRole(), account.getId())
                            .contains(BackOfficePermissions.REFUNDS_WRITE)) {
                notifier.notify(account.getId(), type, title, body, DESK_LINK);
            }
        }
    }
}