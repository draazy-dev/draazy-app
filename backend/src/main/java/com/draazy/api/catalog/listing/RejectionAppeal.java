package com.draazy.api.catalog.listing;

import java.util.UUID;

public interface RejectionAppeal {
    boolean mayResubmit(UUID propertyId);
}