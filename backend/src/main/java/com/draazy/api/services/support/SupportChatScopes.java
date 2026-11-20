package com.draazy.api.services.support;

import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficeFunctions;
import com.draazy.api.security.Roles;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Maps a staff member's back-office functions to the chat contexts they work. */
@Component
class SupportChatScopes {
    private final AccountPermissions permissions;

    SupportChatScopes(AccountPermissions permissions) {
        this.permissions = permissions;
    }

    SupportChatScope resolve(AuthPrincipal caller) {
        return resolve(caller.role(), caller.userId());
    }

    SupportChatScope resolve(String role, UUID userId) {
        if (Roles.Wire.ADMIN.equals(role) || Roles.Wire.MANAGER.equals(role)) {
            return SupportChatScope.FULL;
        }
        Set<String> functions = permissions.functionsFor(role, userId);
        if (functions.contains(BackOfficeFunctions.SUPPORT)) {
            return SupportChatScope.FULL;
        }
        Set<String> contexts = new LinkedHashSet<>();
        if (functions.contains(BackOfficeFunctions.LISTING_MODERATION)
                || functions.contains(BackOfficeFunctions.PROPERTY_VERIFICATION)) {
            contexts.add("property");
        }
        if (functions.contains(BackOfficeFunctions.FLATMATES)) {
            contexts.add("flatmate");
        }
        Set<String> desks = BackOfficeFunctions.desksFor(functions);
        if (!desks.isEmpty()) {
            contexts.add("request");
        }
        if (functions.contains(BackOfficeFunctions.KYC)) {
            contexts.add("identity");
        }
        if (functions.contains(BackOfficeFunctions.REFUNDS)) {
            contexts.add("invoice");
        }
        return new SupportChatScope(false, contexts, desks);
    }

    SupportChatScope require(AuthPrincipal caller) {
        SupportChatScope scope = resolve(caller);
        if (scope.isEmpty()) {
            throw new ForbiddenException("Your account cannot access support chats.");
        }
        return scope;
    }

    SupportChatScope requireFull(AuthPrincipal caller) {
        SupportChatScope scope = resolve(caller);
        if (!scope.full()) {
            throw new ForbiddenException("Only Support can do this.");
        }
        return scope;
    }
}
