package com.draazy.api.engagement.flatmate;

import com.draazy.api.support.UploadedPhotos;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

public final class FlatmateRoomFixture {
    public static final String BASICS = """
            "homeTypeLabel":"Flat","furnishing":"semi","flatNumber":"A-101",\
            "noticePeriodDays":30,"lockInMonths":0""";

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
