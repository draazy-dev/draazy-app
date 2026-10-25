package com.draazy.api.engagement.flatmate;

import com.draazy.api.support.UploadedPhotos;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/** JSON fragments, comma-separated and without braces, for what {@link NewRoomRequirements} asks of a new room. */
public final class FlatmateRoomFixture {

    /** Top-level answers a new room must carry besides bhk, roomType, attachedBath, details and photos. */
    public static final String BASICS = """
            "homeTypeLabel":"Flat","furnishing":"semi","flatNumber":"A-101",\
            "noticePeriodDays":30,"lockInMonths":0""";

    /** The inside of a {@code "details"} object for a flat. */
    public static final String DETAILS_FIELDS = "\"bathrooms\":2,\"floor\":\"3\",\"totalFloors\":10";

    public static final String DETAILS = "\"details\":{" + DETAILS_FIELDS + "}";

    public static String photos(UUID host) {
        return photos(host, NewRoomRequirements.MIN_PHOTOS);
    }

    public static String photos(UUID host, int count) {
        return "\"photos\":[" + IntStream.range(0, count)
                .mapToObj(i -> "\"" + UploadedPhotos.of(host) + "\"")
                .collect(Collectors.joining(",")) + "]";
    }

    private FlatmateRoomFixture() {
    }
}
