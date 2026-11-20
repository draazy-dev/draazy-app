package com.draazy.api.engagement.review;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.AlreadyReviewedException;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ReviewNotEligibleException;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.common.trust.OwnerRelationship;
import com.draazy.api.common.trust.PropertyExperience;
import com.draazy.api.common.trust.ReviewerStanding;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ReviewService {
    private static final ObjectMapper CATEGORIES_JSON = JsonMapper.builder().build();

    private static final int RATING_SCALE = 1;

    private final ReviewRepository reviews;
    private final ReviewMapper mapper;
    private final ReviewTargetKey targetKey;
    private final PropertyRepository properties;
    private final PropertyExperience experience;
    private final UserRepository users;
    private final OwnerRelationship ownerRelationship;

    public ReviewService(ReviewRepository reviews, ReviewMapper mapper, ReviewTargetKey targetKey,
            PropertyRepository properties, PropertyExperience experience, UserRepository users,
            OwnerRelationship ownerRelationship) {
        this.reviews = reviews;
        this.mapper = mapper;
        this.targetKey = targetKey;
        this.properties = properties;
        this.experience = experience;
        this.users = users;
        this.ownerRelationship = ownerRelationship;
    }

    @Transactional(readOnly = true)
    public ReviewListResponse listForProperty(UUID propertyId, UUID viewerId) {
        requireReachableProperty(propertyId);
        String targetId = propertyId.toString();
        List<ReviewResponse> rows = withAuthors(reviews.findPublished(ReviewTargetTypes.PROPERTY, targetId), viewerId);
        return ReviewListResponse.of(new PageImpl<>(rows), summaryOf(ReviewTargetTypes.PROPERTY, targetId));
    }

    @Transactional(readOnly = true)
    public Page<ReviewModerationRow> listForModeration(String status, String q, Integer days, Pageable pageable) {
        Instant since = PlatformTime.sinceOrNull(days);
        Page<Review> page = reviews.findForModeration(
                status == null || status.isBlank() ? null : status.strip(), LikePatterns.contains(q),
                since == null ? Instant.EPOCH : since, pageable);
        Map<UUID, User> authors = authors(page.getContent());
        return page.map(r -> ReviewModerationRow.of(r, authorOf(authors, r)));
    }

    @Transactional(readOnly = true)
    public Map<String, Long> moderationCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("pending", 0L);
        counts.put("published", 0L);
        counts.put("rejected", 0L);
        long all = 0;
        for (Object[] row : reviews.countByStatus()) {
            long n = ((Number) row[1]).longValue();
            counts.merge((String) row[0], n, Long::sum);
            all += n;
        }
        counts.put("all", all);
        return counts;
    }

    @Transactional(readOnly = true)
    public ReviewListResponse listForEntity(String entityType, String entityId, Pageable pageable, UUID viewerId) {
        String key = targetKey.resolve(entityType, entityId);
        Page<Review> page = reviews.findPublished(entityType, key, pageable);
        Map<UUID, User> authors = authors(page.getContent());
        return ReviewListResponse.of(
                page.map(r -> mapper.toResponse(r, nameOf(authors, r), mineFor(r, viewerId))),
                summaryOf(entityType, key));
    }

    @Transactional
    public ReviewResponse createForProperty(UUID authorId, UUID propertyId,
            ReviewCreateRequest body) {
        Property property = requireProperty(propertyId);

        if (property.getOwner() != null && authorId.equals(property.getOwner().getId())) {
            throw new ReviewNotEligibleException("You cannot review your own listing");
        }

        ReviewerStanding standing = experience.standingOf(authorId, propertyId);
        if (standing == ReviewerStanding.NONE) {
            throw new ReviewNotEligibleException(
                    "Only someone who has completed a visit to this property, or held a tenancy on "
                            + "it, can review it");
        }

        Review review = persist(authorId, ReviewTargetTypes.PROPERTY, propertyId.toString(), body,
                ReviewContexts.fromStanding(standing));
        return mapper.toResponse(review, displayName(authorId), Boolean.TRUE);
    }

    @Transactional
    public ReviewResponse createForEntity(UUID authorId, String entityType, String entityId,
            ReviewCreateRequest body) {
        String key = targetKey.resolve(entityType, entityId);
        if (ReviewTargetTypes.OWNER.equals(entityType)) {
            requireOwnerReviewable(authorId, UUID.fromString(key));
        }
        Review review = persist(authorId, entityType, key, body, null);
        return mapper.toResponse(review, displayName(authorId), Boolean.TRUE);
    }

    @Transactional
    public ReviewResponse update(UUID authorId, UUID reviewId, ReviewCreateRequest body) {
        Review review = requireOwnEditable(authorId, reviewId);
        review.setRating(body.rating());
        review.setTitle(body.title());
        review.setBody(body.body());
        review.setRecommend(body.recommend());
        review.setCategories(categoriesJson(review.getTargetType(), body.categories()));
        return mapper.toResponse(reviews.saveAndFlush(review), displayName(authorId), Boolean.TRUE);
    }

    @Transactional
    public void delete(UUID authorId, UUID reviewId) {
        reviews.delete(requireOwnEditable(authorId, reviewId));
    }

    private void requireOwnerReviewable(UUID authorId, UUID ownerId) {
        if (authorId.equals(ownerId)) {
            throw new ReviewNotEligibleException("You cannot review yourself");
        }
        if (!ownerRelationship.exists(authorId, ownerId)) {
            throw new ReviewNotEligibleException(
                    "Only someone who has dealt with this owner can review them");
        }
    }

    private Review requireOwnEditable(UUID authorId, UUID reviewId) {
        return reviews.findById(reviewId)
                .filter(r -> authorId.equals(r.getAuthorId()))
                .filter(r -> !ReviewStatuses.REJECTED.equals(r.getStatus()))
                .orElseThrow(() -> NotFoundException.of("Review"));
    }

    private Review persist(UUID authorId, String targetType, String targetId,
            ReviewCreateRequest body, String context) {
        if (reviews.existsByAuthorIdAndTargetTypeAndTargetId(authorId, targetType, targetId)) {
            throw new AlreadyReviewedException("You have already reviewed this");
        }
        String categories = categoriesJson(targetType, body.categories());

        Review review = new Review(targetType, targetId, authorId, body.rating());
        review.setTitle(body.title());
        review.setBody(body.body());
        review.setRecommend(body.recommend());
        review.setContext(context);
        review.setCategories(categories);
        review.setStatus(ReviewStatuses.PUBLISHED);
        return reviews.save(review);
    }

    private static String categoriesJson(String targetType, Map<String, Integer> given) {
        try {
            return CATEGORIES_JSON.writeValueAsString(ReviewCategories.validated(targetType, given));
        } catch (IllegalArgumentException rejected) {
            throw new BadRequestException(rejected.getMessage());
        }
    }

    private Property requireProperty(UUID propertyId) {
        return properties.findById(propertyId)
                .orElseThrow(() -> NotFoundException.of("Property"));
    }

    private void requireReachableProperty(UUID propertyId) {
        if (!properties.existsByIdAndArchivedFalseAndStatusIn(
                propertyId, PropertyStatus.DIRECTLY_REACHABLE)) {
            throw NotFoundException.of("Property");
        }
    }

    private static User authorOf(Map<UUID, User> authors, Review row) {
        return row.getAuthorId() == null ? null : authors.get(row.getAuthorId());
    }

    private static String nameOf(Map<UUID, User> authors, Review row) {
        User author = authorOf(authors, row);
        return author == null ? null : author.getName();
    }

    private List<ReviewResponse> withAuthors(List<Review> rows, UUID viewerId) {
        Map<UUID, User> authors = authors(rows);
        return rows.stream()
                .map(r -> mapper.toResponse(r, nameOf(authors, r), mineFor(r, viewerId)))
                .toList();
    }

    private static Boolean mineFor(Review row, UUID viewerId) {
        return viewerId != null && viewerId.equals(row.getAuthorId()) ? Boolean.TRUE : null;
    }

    private Map<UUID, User> authors(List<Review> rows) {
        Set<UUID> ids = rows.stream()
                .map(Review::getAuthorId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, User> out = new HashMap<>();
        for (User u : users.findAllById(ids)) {
            out.put(u.getId(), u);
        }
        return out;
    }

    private String displayName(UUID userId) {
        return users.findById(userId).map(User::getName).orElse(null);
    }

    private ReviewSummaryResponse summaryOf(String targetType, String targetId) {
        ReviewRatingTally tally = reviews.tallyFor(targetType, targetId);
        long total = nonNull(tally.reviewCount());
        return new ReviewSummaryResponse(
                total == 0 ? null : rounded(tally.avgRating()),
                total,
                distributionOf(tally),
                categoryAveragesFor(targetType, targetId));
    }

    private static Map<String, Long> distributionOf(ReviewRatingTally tally) {
        Map<String, Long> stars = new LinkedHashMap<>();
        stars.put("1", nonNull(tally.star1()));
        stars.put("2", nonNull(tally.star2()));
        stars.put("3", nonNull(tally.star3()));
        stars.put("4", nonNull(tally.star4()));
        stars.put("5", nonNull(tally.star5()));
        return stars;
    }

    private Map<String, BigDecimal> categoryAveragesFor(String targetType, String targetId) {
        Map<String, BigDecimal> averages = new LinkedHashMap<>();
        for (ReviewCategoryAverage row : reviews.categoryAveragesFor(
                targetType, targetId, ReviewCategories.forTarget(targetType))) {
            if (row.getAverage() != null) {
                averages.put(row.getCategory(),
                        row.getAverage().setScale(RATING_SCALE, RoundingMode.HALF_UP));
            }
        }
        return averages;
    }

    private static BigDecimal rounded(Double average) {
        return average == null ? null
                : BigDecimal.valueOf(average).setScale(RATING_SCALE, RoundingMode.HALF_UP);
    }

    private static long nonNull(Long count) {
        return count == null ? 0L : count;
    }
}
