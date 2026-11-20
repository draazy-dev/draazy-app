package com.draazy.api.security;

import com.draazy.api.common.access.BackOfficeGrant;
import com.draazy.api.common.access.BackOfficeGrantRepository;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component(BackOfficePermissions.BEAN)
public class AccountPermissions {
    private static final Logger log = LoggerFactory.getLogger(AccountPermissions.class);

    private final BackOfficeGrantRepository grants;
    private final ObjectMapper objectMapper;

    public AccountPermissions(BackOfficeGrantRepository grants, ObjectMapper objectMapper) {
        this.grants = grants;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public boolean granted(Authentication authentication, String permission) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof AuthPrincipal caller)) {
            return false;
        }
        return granted(caller, permission);
    }

    @Transactional(readOnly = true)
    public boolean granted(AuthPrincipal caller, String permission) {
        if (caller == null || permission == null) {
            return false;
        }
        return effectiveFor(caller.role(), caller.userId()).contains(permission);
    }

    @Transactional(readOnly = true)
    public Set<String> effectiveFor(String wireRole, UUID userId) {
        if (!Roles.isBackOffice(wireRole)) {
            return Set.of();
        }
        Set<String> baseline = BackOfficePermissions.baselineFor(wireRole);
        if (Roles.Wire.ADMIN.equals(wireRole)) {
            return baseline;
        }
        Optional<BackOfficeGrant> stored = userId == null ? Optional.empty() : grants.findById(userId);
        Set<String> functions = stored
                .map(grant -> parse(userId, grant.getPermissions()))
                .orElseGet(() -> BackOfficeFunctions.defaultForRole(wireRole));
        if (functions == null) {
            return Set.of(BackOfficePermissions.DASHBOARD_READ);
        }
        Set<String> effective = BackOfficeFunctions.effectiveAtoms(wireRole, functions);
        if (Roles.Wire.MANAGER.equals(wireRole)) {
            effective = new LinkedHashSet<>(effective);
            effective.add(BackOfficePermissions.USERS_READ);
            effective.add(BackOfficePermissions.USERS_WRITE);
            effective.add(BackOfficePermissions.AUDIT_READ);
            effective.add(BackOfficePermissions.LEADS_MANAGE);
        }
        return effective;
    }

    @Transactional(readOnly = true)
    public Set<String> functionsFor(String wireRole, UUID userId) {
        if (!Roles.isBackOffice(wireRole)) {
            return Set.of();
        }
        Optional<BackOfficeGrant> stored = userId == null ? Optional.empty() : grants.findById(userId);
        if (stored.isEmpty()) {
            return BackOfficeFunctions.defaultForRole(wireRole);
        }
        Set<String> functions = parse(userId, stored.get().getPermissions());
        return functions == null ? Set.of() : functions;
    }

    @Transactional(readOnly = true)
    public Set<String> desksFor(AuthPrincipal caller) {
        if (caller == null || !Roles.Wire.STAFF.equals(caller.role())) {
            return Set.of();
        }
        return desksFor(caller.role(), caller.userId());
    }

    @Transactional(readOnly = true)
    public Set<String> desksFor(String wireRole, UUID userId) {
        if (!Roles.Wire.STAFF.equals(wireRole)) {
            return Set.of();
        }
        return BackOfficeFunctions.desksFor(functionsFor(wireRole, userId));
    }

    private Set<String> parse(UUID userId, String raw) {
        try {
            JsonNode document = objectMapper.readTree(raw);
            if (!document.isArray()) {
                log.warn("back_office_permissions row for {} is not a JSON array; denying", userId);
                return null;
            }
            Set<String> names = new LinkedHashSet<>();
            for (JsonNode entry : document) {
                if (!entry.isString()) {
                    log.warn("back_office_permissions row for {} holds a non-string entry; denying",
                            userId);
                    return null;
                }
                String name = entry.stringValue();
                if (BackOfficeFunctions.isKnown(name)) {
                    names.add(name);
                }
            }
            return names;
        } catch (RuntimeException malformed) {
            log.warn("back_office_permissions row for {} could not be parsed; denying", userId,
                    malformed);
            return null;
        }
    }
}
