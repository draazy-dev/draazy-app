package com.draazy.api.engagement.review;

public record ReviewRatingTally(
        Long reviewCount,
        Double avgRating,
        Long star1,
        Long star2,
        Long star3,
        Long star4,
        Long star5) {
}
