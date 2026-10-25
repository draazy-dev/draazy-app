package com.draazy.api.engagement.flatmate;

import java.util.List;

public record FlatmateDetailDto(String kind, boolean owned, Object item, List<String> photos,
        Verification verification, Specs specs) {

    static final String KIND_GROUP = "group";
    static final String KIND_ROOM = "room";
    static final String KIND_POST = "post";

    public record Verification(String status, boolean ownerConsent, String reason) {

        static Verification of(FlatmateReview review) {
            return new Verification(review.getStatus(), review.isOwnerConsent(),
                    review.getReason());
        }
    }

    /** The room's wizard answers a visitor may read; tower, street, landmark and pincode stay host-only. */
    public record Specs(String floor, Integer totalFloors, Integer floorsInHouse, Integer bathrooms,
            Integer balconies, List<String> furniture) {

        static Specs of(FlatmateRoomDetails d) {
            return d == null ? null : new Specs(d.floor(), d.totalFloors(), d.floorsInHouse(),
                    d.bathrooms(), d.balconies(), d.furniture());
        }
    }

    static FlatmateDetailDto owned(String kind, Object item, List<String> photos,
            Verification verification) {
        return new FlatmateDetailDto(kind, true, item, photos, verification, null);
    }

    static FlatmateDetailDto visitor(String kind, Object item, List<String> photos) {
        return new FlatmateDetailDto(kind, false, item, photos, null, null);
    }

    FlatmateDetailDto withSpecs(Specs value) {
        return new FlatmateDetailDto(kind, owned, item, photos, verification, value);
    }
}
