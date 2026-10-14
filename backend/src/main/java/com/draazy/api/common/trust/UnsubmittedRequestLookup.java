package com.draazy.api.common.trust;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

public interface UnsubmittedRequestLookup {

    // Of these service requests, the ones still awaiting payment: nothing has reached staff yet.
    Set<UUID> unsubmitted(Collection<UUID> serviceRequestIds);
}
