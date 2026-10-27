package com.draazy.api.catalog.listing;

import java.util.UUID;

/** Whether a rejected listing's verdict leaves the owner room to fix it. Moderation answers it so catalog need not
 * import moderation. */
public interface RejectionAppeal {

    boolean mayResubmit(UUID propertyId);
}