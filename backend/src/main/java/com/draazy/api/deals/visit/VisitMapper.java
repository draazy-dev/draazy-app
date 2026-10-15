package com.draazy.api.deals.visit;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;

public final class VisitMapper {

    private VisitMapper() {
    }

    public static VisitDto toDto(Visit visit, Property property, User visitor, ContactVisibility visibility) {
        return new VisitDto(
                visit.getId().toString(),
                visit.getPropertyId().toString(),
                property != null ? property.getTitle() : null,
                property != null ? property.getSlug() : null,
                toParty(visitor, visibility),
                visit.getSlot(),
                visit.getMode(),
                visit.getStatus(),
                visit.getCreatedAt(),
                visit.getNote());
    }

    public static VisitDto toDto(Visit visit, User visitor, ContactVisibility visibility) {
        return toDto(visit, null, visitor, visibility);
    }

    // Mobile is masked unless viewer is the visitor or confirmed owner.
    private static VisitDto.Party toParty(User visitor, ContactVisibility visibility) {
        if (visitor == null) {
            return null;
        }
        return new VisitDto.Party(
                visitor.getId().toString(),
                visitor.getName(),
                maskMobile(visitor.getMobile(), visibility),
                "buyer");
    }

    private static String maskMobile(String mobile, ContactVisibility visibility) {
        return MobileMask.applyTo(mobile, visibility);
    }
}
