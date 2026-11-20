package com.draazy.api.common.trust;

import com.draazy.api.security.AuthPrincipal;

/** Posts into a listing's review thread, as its owner or as a back-office reviewer. */
public interface PropertyReviewThread {
    void post(AuthPrincipal actor, String propertyId, String body);
}
