package com.draazy.api.security;

import com.draazy.api.common.settings.Setting;
import com.draazy.api.common.settings.SettingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component(Capabilities.BEAN)
public class PermissionMap {
    private static final Logger log = LoggerFactory.getLogger(PermissionMap.class);

    static final String PERMISSIONS_KEY = "permissions";

    private final SettingRepository settings;
    private final ObjectMapper objectMapper;
    private final AccountPermissions accountPermissions;

    public PermissionMap(SettingRepository settings, ObjectMapper objectMapper,
            AccountPermissions accountPermissions) {
        this.settings = settings;
        this.objectMapper = objectMapper;
        this.accountPermissions = accountPermissions;
    }

    @Transactional(readOnly = true)
    public boolean granted(Authentication authentication, String capability) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof AuthPrincipal caller)) {
            return false;
        }
        return granted(caller, capability);
    }

    @Transactional(readOnly = true)
    public boolean granted(AuthPrincipal caller, String capability) {
        if (caller == null) {
            return false;
        }
        if (Capabilities.VIEW_DASHBOARD.equals(capability) && Roles.isBackOffice(caller.role())) {
            return true;
        }
        JsonNode allowList = storedAllowList();
        if (allowList == null) {
            return true;
        }
        if (Roles.Wire.STAFF.equals(caller.role())) {
            for (String desk : accountPermissions.desksFor(caller)) {
                if (grants(allowList.get(desk), capability)) {
                    return true;
                }
            }
            return false;
        }
        String key = keyFor(caller);
        return key != null && grants(allowList.get(key), capability);
    }

    private boolean grants(JsonNode bundle, String capability) {
        if (bundle == null || !bundle.isArray()) {
            return false;
        }
        for (JsonNode entry : bundle) {
            if (!entry.isString()) {
                continue;
            }
            String held = entry.stringValue();
            if (Capabilities.WILDCARD.equals(held) || capability.equals(held)) {
                return true;
            }
        }
        return false;
    }

    private String keyFor(AuthPrincipal caller) {
        if (Roles.Wire.ADMIN.equals(caller.role()) || Roles.Wire.MANAGER.equals(caller.role())) {
            return Roles.Wire.ADMIN;
        }
        return null;
    }

    private JsonNode storedAllowList() {
        try {
            JsonNode document = settings.findById(PERMISSIONS_KEY)
                    .map(Setting::getValue)
                    .map(objectMapper::readTree)
                    .orElse(null);
            if (document == null || !document.isObject()) {
                return null;
            }
            return document;
        } catch (RuntimeException malformed) {
            log.warn("settings.{} could not be read; falling back to role-only authorisation",
                    PERMISSIONS_KEY, malformed);
            return null;
        }
    }
}
