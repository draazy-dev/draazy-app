package com.draazy.api.engagement.flatmate;

import java.util.List;

record FlatmateEditImpact(boolean remoderationRequired, boolean recheckOnly, List<String> rechecked) {
    static final FlatmateEditImpact SILENT = new FlatmateEditImpact(false, false, List.of());
}
