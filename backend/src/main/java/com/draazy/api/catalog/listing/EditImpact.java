package com.draazy.api.catalog.listing;

import java.util.List;
import java.util.Map;

record EditImpact(boolean remoderationRequired, boolean recheckOnly, List<String> rechecked,
        List<Map<String, String>> changes) {
}
