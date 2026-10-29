package com.draazy.api.leads.photos;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import org.springframework.stereotype.Component;

@Component
public class PhotoRequestMapper {
    public PhotoRequestResponse toResponse(PhotoRequest row, Property property, User requester) {
        return new PhotoRequestResponse(
                row.getId().toString(),
                row.getPropertyId().toString(),
                property == null ? null : property.getSlug(),
                property == null ? null : property.getTitle(),
                toRequester(requester),
                row.getStatus(),
                row.getCreatedAt());
    }

    private PhotoRequestResponse.Requester toRequester(User requester) {
        if (requester == null) {
            return null;
        }
        return new PhotoRequestResponse.Requester(
                requester.getName(), MobileMask.mask(requester.getMobile()));
    }
}
