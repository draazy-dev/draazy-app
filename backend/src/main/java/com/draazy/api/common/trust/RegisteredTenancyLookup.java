package com.draazy.api.common.trust;

import java.util.UUID;

public interface RegisteredTenancyLookup {
    boolean hasRegisteredTenancy(UUID propertyId, String tenantMobile);
}
