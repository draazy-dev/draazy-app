package com.draazy.api.catalog.listing;

import java.util.List;
import java.util.Map;

/** What a PATCH earned; {@code changes} is old-to-new per re-checked field, for the staff queue. */
record EditImpact(boolean remoderationRequired, boolean recheckOnly, List<String> rechecked,
        List<Map<String, String>> changes) {
}
