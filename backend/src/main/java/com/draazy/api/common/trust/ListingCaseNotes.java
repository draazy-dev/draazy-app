package com.draazy.api.common.trust;

import java.util.UUID;

public interface ListingCaseNotes {
    void post(UUID propertyId, String deal, String body);

    void postInternalOnce(UUID propertyId, String deal, String body);
}
