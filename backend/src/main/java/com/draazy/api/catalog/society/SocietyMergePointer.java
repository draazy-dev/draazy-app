package com.draazy.api.catalog.society;

import com.draazy.api.common.error.NotFoundException;

final class SocietyMergePointer {
    private SocietyMergePointer() {
    }

    static Society survivor(SocietyRepository societies, Society society) {
        if (society == null || society.getMergedInto() == null) {
            return society;
        }
        return societies.findById(society.getMergedInto())
                .orElseThrow(() -> NotFoundException.of("Society"));
    }
}
