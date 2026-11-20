package com.draazy.api.moderation.duplicate;

import java.util.List;

public record DuplicateClusterReport(
        List<DuplicateCluster> clusters,
        int scanned,
        boolean truncated) {
}
