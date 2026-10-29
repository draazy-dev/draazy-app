package com.draazy.api.catalog.property;

import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.identity.user.UserStatuses;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaExpression;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

final class PropertySpecs {
    private static final char LIKE_ESCAPE = '\\';

    private static final int MAX_Q_TOKENS = 6;
    private static final int MAX_LIST_TOKENS = 16;

    private static final double FUZZY_THRESHOLD = 0.5;

    private static final Pattern FUZZY_WORD = Pattern.compile("\\p{L}{5,}");
    private static final Pattern PHONE_TEXT = Pattern.compile("^[+\\d\\s().-]+$");
    private static final Set<String> FACING = Set.of(
            "east", "west", "north", "south", "north-east", "north-west", "south-east", "south-west");

    private static final Map<String, List<String>> FACING_MATCHES = Map.of(
            "north", List.of("north", "north-east", "north-west"),
            "south", List.of("south", "south-east", "south-west"),
            "east", List.of("east", "north-east", "south-east"),
            "west", List.of("west", "north-west", "south-west"));
    private static final Set<String> SHELL = Set.of("bareshell", "warmshell", "furnished");
    private static final Set<String> RESIDENTIAL_KEYS = Set.of("flat", "house", "villa");
    private static final Set<String> NA = Set.of("agricultural", "deemed", "sanctioned");
    private PropertySpecs() {
    }

    static Specification<Property> publicSearch(PropertySearchQuery filters) {
        return publicSearch(filters, ListingFacets.NONE);
    }

    static Specification<Property> publicSearch(PropertySearchQuery filters, ListingFacets extra) {
        return publicSearch(filters, extra, null);
    }

    static Specification<Property> publicSearch(PropertySearchQuery filters, ListingFacets extra,
            LocalityPoint localityCenter) {
        return (root, query, cb) -> {
            List<Predicate> where = facets(filters, root, cb, localityCenter);
            publicTextSearch(filters, root, query, cb, where);
            listingFacets(extra, root, cb, where);

            where.add(publiclyVisible(root, cb));

            if (filters.status() != null && !PropertyStatus.APPROVED.equals(filters.status())) {
                where.add(cb.equal(root.get("status"), filters.status()));
            }
            return cb.and(where.toArray(Predicate[]::new));
        };
    }

    private static Predicate publiclyVisible(Root<Property> root, CriteriaBuilder cb) {
        return cb.and(
                cb.isFalse(root.get("archived")),
                cb.equal(root.get("status"), PropertyStatus.APPROVED),
                cb.notEqual(root.get("owner").get("status"), UserStatuses.SUSPENDED),
                cb.or(cb.isTrue(root.get("demo")),
                        cb.greaterThan(cb.coalesce(root.get("lastConfirmedAt"), root.get("createdAt")),
                                Freshness.dormantCutoff(Instant.now()))));
    }

    static Specification<Property> residential() {
        return (root, query, cb) -> root.get("propertyTypeKey").in(RESIDENTIAL_KEYS);
    }

    static Specification<Property> newestFirst() {
        return (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType())) {
                query.orderBy(
                        cb.desc(root.get("createdAt")),

                        cb.desc(root.get("id")));
            }
            return null;
        };
    }

    static Specification<Property> relevanceFirst(Instant now) {
        return (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType())) {
                query.orderBy(relevanceOrder(root, cb, now));
            }
            return null;
        };
    }

    static Specification<Property> verifiedFirst(Instant now) {
        return (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType())) {
                List<Order> order = new ArrayList<>();
                Predicate verified = cb.or(cb.isTrue(root.get("ownerVerified")), ownershipLive(root, cb, now));
                order.add(cb.desc(weight(verified, 1, cb)));
                order.addAll(relevanceOrder(root, cb, now));
                query.orderBy(order);
            }
            return null;
        };
    }

    static Specification<Property> pricePerSqftFirst() {
        return (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType())) {
                Expression<Double> area = areaSqft(root, cb);
                Expression<Integer> missingArea = cb.<Integer>selectCase()
                        .when(cb.or(root.get("area").isNull(), cb.le(area, 0.0)), 1)
                        .otherwise(0);
                Expression<Double> divisor = cb.function("nullif", Double.class, area, cb.literal(0.0));
                query.orderBy(
                        cb.asc(missingArea),
                        cb.asc(cb.quot(root.get("price").as(Double.class), divisor)),
                        cb.desc(root.get("createdAt")),
                        cb.desc(root.get("id")));
            }
            return null;
        };
    }

    private static List<Order> relevanceOrder(Root<Property> root, CriteriaBuilder cb, Instant now) {
        Expression<Instant> since = cb.coalesce(root.get("lastConfirmedAt"), root.get("createdAt"));
        Expression<Integer> freshness = cb.<Integer>selectCase()
                .when(cb.greaterThanOrEqualTo(since, now.minus(Duration.ofDays(Freshness.FRESH_DAYS))), 200)
                .when(cb.greaterThanOrEqualTo(since, now.minus(Duration.ofDays(Freshness.AGING_DAYS))), 120)
                .when(cb.greaterThanOrEqualTo(since, now.minus(Duration.ofDays(Freshness.STALE_DAYS))), 40)
                .otherwise(0);
        Expression<Integer> score = cb.sum(cb.sum(cb.sum(cb.sum(cb.sum(
                weight(cb.isTrue(root.get("featured")), 1000, cb),
                weight(cb.isTrue(root.get("ownerVerified")), 250, cb)),

                weight(ownershipLive(root, cb, now), 200, cb)),
                weight(hasRera(root, cb), 80, cb)),
                freshness),

                cb.coalesce(root.get("qualityScore").as(Integer.class), 0));
        return List.of(
                cb.desc(score),
                cb.desc(root.get("createdAt")),

                cb.desc(root.get("id")));
    }

    private static Expression<Integer> weight(Predicate when, int points, CriteriaBuilder cb) {
        return cb.<Integer>selectCase().when(when, points).otherwise(0);
    }

    static Specification<Property> adminSearch(PropertySearchQuery filters, ModerationFacets mod, Instant since) {
        return (root, query, cb) -> {
            if (query != null && !Long.class.equals(query.getResultType())) {
                root.fetch("owner", JoinType.LEFT);
            }
            List<Predicate> where = facets(filters, root, cb, null);
            adminTextSearch(filters, root, cb, where);
            if (filters.status() != null) {
                where.add(cb.equal(root.get("status"), filters.status()));
            }
            if (since != null) {
                String column = Boolean.TRUE.equals(mod.recheck()) ? "recheckRequestedAt"
                        : Boolean.TRUE.equals(mod.badge()) ? "ownershipRequestedAt" : "createdAt";
                where.add(cb.greaterThanOrEqualTo(root.<Instant>get(column), since));
            }
            if (mod.archived() != null) {
                where.add(mod.archived()
                        ? cb.isTrue(root.get("archived")) : cb.isFalse(root.get("archived")));
            }
            if (mod.recheck() != null) {
                Predicate fieldRecheck = cb.and(
                        cb.isNotNull(root.get("recheckRequestedAt")),
                        cb.notEqual(cb.coalesce(root.get("recheckReason"), ""), Property.OWNERSHIP_REVIEW_ITEM));
                where.add(mod.recheck()
                        ? cb.and(fieldRecheck, cb.not(root.get("status").in(PropertyStatus.SOLD, PropertyStatus.RENTED)))
                        : cb.not(fieldRecheck));
            }
            if (mod.badge() != null) {
                where.add(mod.badge()
                        ? cb.isNotNull(root.get("ownershipRequestedAt"))
                        : cb.isNull(root.get("ownershipRequestedAt")));
            }
            if (mod.featured() != null) {
                where.add(mod.featured()
                        ? cb.isTrue(root.get("featured")) : cb.isFalse(root.get("featured")));
            }
            if (mod.postedByAdmin() != null) {
                where.add(mod.postedByAdmin()
                        ? cb.isTrue(root.get("postedByAdmin")) : cb.isFalse(root.get("postedByAdmin")));
            }
            if (mod.unconfirmed() != null) {
                Expression<Instant> lastSeen =
                        cb.coalesce(root.get("lastConfirmedAt"), root.get("createdAt"));
                Instant cutoff = Freshness.unconfirmedBefore(Instant.now());
                where.add(mod.unconfirmed()
                        ? cb.lessThanOrEqualTo(lastSeen, cutoff)
                        : cb.greaterThan(lastSeen, cutoff));
            }
            if (mod.progress() != null) {
                where.add(progress(mod.progress(), root, cb));
            }

            return where.isEmpty() ? cb.conjunction() : cb.and(where.toArray(Predicate[]::new));
        };
    }

    private static Predicate progress(String filter, Root<Property> root, CriteriaBuilder cb) {
        Predicate pending = cb.and(cb.equal(root.get("status"), PropertyStatus.PENDING), cb.isFalse(root.get("archived")));
        Predicate asked = cb.isNotNull(root.get("infoRequestedAt"));
        Predicate unconfirmed = cb.and(cb.isTrue(root.get("postedByAdmin")), cb.isNull(root.get("ownerConfirmedAt")));
        Predicate started = cb.isNotNull(root.get("reviewStartedAt"));
        return switch (filter) {
            case "needs_info" -> cb.and(pending, asked);
            case "awaiting_confirmation" -> cb.and(pending, cb.not(asked), unconfirmed);
            case "in_review" -> cb.and(pending, cb.not(asked), cb.not(unconfirmed), started);
            case "ready" -> cb.and(pending, cb.not(asked), cb.not(unconfirmed), cb.not(started));
            default -> throw new IllegalArgumentException(filter);
        };
    }

    private static List<Predicate> facets(PropertySearchQuery filters, Root<Property> root,
            CriteriaBuilder cb, LocalityPoint localityCenter) {
        List<Predicate> where = new ArrayList<>();
        if (filters.deal() != null) {
            where.add(cb.equal(root.get("deal"), filters.deal()));
        }
        if (StringUtils.hasText(filters.type())) {
            where.add(cb.equal(cb.lower(root.get("propertyType")), filters.type().toLowerCase()));
        }
        if (StringUtils.hasText(filters.locality())) {
            Predicate bound = cb.equal(root.get("localitySlug"), filters.locality());
            where.add(localityCenter == null ? bound : cb.or(bound,
                    withinRadius(root, cb, localityCenter.lat(), localityCenter.lng(), LOCALITY_RADIUS_KM)));
        }
        if (filters.bhk() != null) {
            where.add(cb.equal(root.get("bhk"), BigDecimal.valueOf(filters.bhk())));
        }
        if (filters.minPrice() != null) {
            where.add(cb.ge(root.get("price"), filters.minPrice()));
        }
        if (filters.maxPrice() != null) {
            where.add(cb.le(root.get("price"), filters.maxPrice()));
        }
        if (filters.furnishing() != null) {
            where.add(cb.equal(root.get("furnishing"), filters.furnishing()));
        }

        if (StringUtils.hasText(filters.possession())) {
            where.add(cb.equal(root.get("possession"), filters.possession()));
        }

        if (StringUtils.hasText(filters.owner())) {
            try {
                where.add(cb.equal(root.get("owner").get("id"), UUID.fromString(filters.owner())));
            } catch (IllegalArgumentException notAnId) {
                where.add(cb.disjunction());
            }
        }
        return where;
    }

    private static void publicTextSearch(PropertySearchQuery filters, Root<Property> root, CriteriaQuery<?> query,
            CriteriaBuilder cb, List<Predicate> where) {
        if (!StringUtils.hasText(filters.q())) {
            return;
        }

        Arrays.stream(filters.q().trim().toLowerCase(Locale.ROOT).split("\\s+"))
                .filter(token -> !token.isEmpty())
                .limit(MAX_Q_TOKENS)
                .forEach(token -> {
                    String like = "%" + LikePatterns.escape(token) + "%";
                    Predicate exact = cb.or(cardText(root, cb).stream()
                            .map(column -> cb.like(column, like, LIKE_ESCAPE)).toArray(Predicate[]::new));
                    if (!FUZZY_WORD.matcher(token).matches()) {
                        where.add(exact);
                        return;
                    }
                    Predicate unmatched = cb.not(cb.exists(liveMatch(query, cb, like)));
                    where.add(cb.or(exact, cb.and(unmatched, close(token, root, cb))));
                });
    }

    private static List<Expression<String>> cardText(Root<Property> root, CriteriaBuilder cb) {
        return List.of(cb.lower(root.get("title")), cb.lower(root.get("locality")),
                cb.lower(root.get("societySlug")), cb.lower(root.get("propertyType")));
    }

    private static Subquery<Integer> liveMatch(CriteriaQuery<?> query, CriteriaBuilder cb, String like) {
        Subquery<Integer> sub = query.subquery(Integer.class);
        Root<Property> other = sub.from(Property.class);
        return sub.select(cb.literal(1)).where(
                publiclyVisible(other, cb),
                cb.or(cardText(other, cb).stream()
                        .map(column -> cb.like(column, like, LIKE_ESCAPE)).toArray(Predicate[]::new)));
    }

    private static Predicate close(String token, Root<Property> root, CriteriaBuilder cb) {
        return cb.or(cardText(root, cb).subList(0, 3).stream()
                .map(column -> cb.greaterThanOrEqualTo(
                        cb.function("word_similarity", Double.class, cb.literal(token), column), FUZZY_THRESHOLD))
                .toArray(Predicate[]::new));
    }

    private static void adminTextSearch(PropertySearchQuery filters, Root<Property> root,
            CriteriaBuilder cb, List<Predicate> where) {
        if (!StringUtils.hasText(filters.q())) {
            return;
        }
        String like = LikePatterns.contains(filters.q());

        JpaExpression<UUID> id = (JpaExpression<UUID>) root.<UUID>get("id");
        Expression<String> idAsText = ((HibernateCriteriaBuilder) cb).cast(id, String.class);
        where.add(cb.or(
                cb.like(cb.lower(root.get("title")), like, LIKE_ESCAPE),
                cb.like(cb.lower(root.get("locality")), like, LIKE_ESCAPE),
                cb.like(cb.lower(root.get("owner").get("name")), like, LIKE_ESCAPE),
                cb.like(root.get("owner").get("mobile"), mobileLike(filters.q(), like), LIKE_ESCAPE),
                cb.like(cb.lower(root.get("slug")), like, LIKE_ESCAPE),
                cb.like(idAsText, like, LIKE_ESCAPE)));
    }

    private static String mobileLike(String q, String textLike) {
        if (!PHONE_TEXT.matcher(q).matches()) {
            return textLike;
        }
        String digits = q.replaceAll("\\D", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        return digits.length() >= 3 ? "%" + LikePatterns.escape(digits) + "%" : textLike;
    }

    private static void availableWithin(Integer days, Root<Property> root, CriteriaBuilder cb,
            List<Predicate> where) {
        if (days == null) {
            return;
        }
        where.add(days < 0
                ? cb.disjunction()
                : cb.lessThanOrEqualTo(root.<LocalDate>get("availableOn"), AvailableOn.today().plusDays(days)));
    }

    private static void listingFacets(ListingFacets f, Root<Property> root, CriteriaBuilder cb,
            List<Predicate> where) {
        if (f == null) {
            return;
        }

        typeFacet(f.types(), root, cb, where);

        inLowerValues(f.commercialUses(), root.get("commercialUseKey"), cb, where);
        in(f.furnishings(), root.get("furnishing"), cb, where);
        in(f.localities(), root.get("localitySlug"), cb, where);
        in(f.societies(), root.get("societySlug"), cb, where);
        idsFacet(f.ids(), root, cb, where);
        inFacing(f.facing(), root.get("facing"), cb, where);
        in(f.landUse(), root.get("landUse"), cb, where);
        in(f.room(), root.get("room"), cb, where);
        in(f.construction(), root.get("possession"), cb, where);
        availableWithin(f.availableWithinDays(), root, cb, where);
        inJsonLowerWhitelisted(f.shell(), SHELL, "shellType", root, cb, where);
        inJsonLowerWhitelisted(f.na(), NA, "naStatus", root, cb, where);
        if (Boolean.TRUE.equals(f.preLeased())) {
            where.add(cb.equal(cb.lower(jsonText("tenancyStatus", root, cb)), "leased"));
        }
        String foodFilter = lower(f.food());
        if ("veg".equals(foodFilter) || "jain".equals(foodFilter) || "nonveg".equals(foodFilter)) {
            Expression<String> food = cb.lower(cb.coalesce(
                    jsonText("food", root, cb), jsonText("foodPref", root, cb)));
            where.add("nonveg".equals(foodFilter)
                    ? cb.or(cb.isNull(food), food.in("veg", "jain").not())
                    : cb.equal(food, foodFilter));
        }

        if (tooMany(f.bhks())) {
            where.add(cb.disjunction());
            return;
        }
        List<String> bhks = clean(f.bhks());
        if (!bhks.isEmpty()) {
            List<Predicate> any = new ArrayList<>();
            for (String token : bhks) {
                boolean open = token.endsWith("plus");
                String digits = open ? token.substring(0, token.length() - 4) : token;
                try {
                    BigDecimal value = new BigDecimal(digits.trim());
                    any.add(open ? cb.ge(root.get("bhk"), value) : cb.equal(root.get("bhk"), value));
                } catch (NumberFormatException notANumber) {
                    any.add(cb.disjunction());
                }
            }
            where.add(cb.or(any.toArray(Predicate[]::new)));
        } else {
            unmatchableIfAsked(f.bhks(), cb, where);
        }

        if (tooMany(f.amenities())) {
            where.add(cb.disjunction());
            return;
        }
        List<String> amenities = clean(f.amenities());
        if (amenities.isEmpty()) {
            unmatchableIfAsked(f.amenities(), cb, where);
        }
        for (String amenity : amenities) {
            where.add(jsonContains(root.get("amenities"), amenity, cb));
        }

        if (tooMany(f.tenants())) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tenantFilters = new ArrayList<>(clean(f.tenants()));
        if (tenantFilters.contains("bachelor-male") || tenantFilters.contains("bachelor-female")) {
            tenantFilters.add("bachelors");
        }
        anyJsonOrNoPreference(tenantFilters.isEmpty() ? f.tenants() : tenantFilters,
            root.get("tenants"), cb, where);

        if (Boolean.TRUE.equals(f.ownerVerified())) {
            where.add(cb.isTrue(root.get("ownerVerified")));
        }
        if (Boolean.TRUE.equals(f.ownershipVerified())) {
            where.add(ownershipLive(root, cb, Instant.now()));
        }
        if (Boolean.TRUE.equals(f.pets())) {
            where.add(cb.isTrue(root.get("pets")));
        }

        if (Boolean.TRUE.equals(f.rera())) {
            where.add(hasRera(root, cb));
        }

        if (f.minArea() != null) {
            where.add(cb.or(root.get("area").isNull(),
                    cb.ge(areaSqft(root, cb), f.minArea().doubleValue())));
        }
        if (f.maxArea() != null) {
            where.add(cb.or(root.get("area").isNull(),
                    cb.le(areaSqft(root, cb), f.maxArea().doubleValue())));
        }
        if (f.minBaths() != null && f.minBaths() >= 1) {
            where.add(cb.or(root.get("bathrooms").isNull(), cb.ge(root.get("bathrooms"), f.minBaths())));
        }
        if (f.minPhotos() != null && f.minPhotos() >= 1) {
            where.add(cb.ge(cb.function("jsonb_array_length", Integer.class, root.get("images")),
                    f.minPhotos()));
        }
        if (f.minAge() != null) {
            where.add(cb.or(root.get("ageYears").isNull(), cb.ge(root.get("ageYears"), f.minAge())));
        }
        if (f.maxAge() != null) {
            where.add(cb.or(root.get("ageYears").isNull(), cb.le(root.get("ageYears"), f.maxAge())));
        }
        if (f.minFloor() != null) {
            where.add(cb.or(root.get("floor").isNull(), cb.ge(root.get("floor"), f.minFloor())));
        }
        if (f.maxFloor() != null) {
            where.add(cb.or(root.get("floor").isNull(), cb.le(root.get("floor"), f.maxFloor())));
        }
        if (f.minDeposit() != null) {
            where.add(cb.or(root.get("deposit").isNull(), cb.ge(root.get("deposit"), f.minDeposit())));
        }
        if (f.maxDeposit() != null) {
            where.add(cb.or(root.get("deposit").isNull(), cb.le(root.get("deposit"), f.maxDeposit())));
        }

        if (f.hasNearPoint()) {
            where.add(withinRadius(root, cb, f.nearLat(), f.nearLng(), f.effectiveRadiusKm()));
        }
    }

    private static Predicate withinRadius(Root<Property> root, CriteriaBuilder cb,
            double lat, double lng, double radiusKm) {
        double latRad = Math.toRadians(lat);
        double lngRad = Math.toRadians(lng);
        double cosLat = Math.cos(latRad);
        double sinLat = Math.sin(latRad);

        double latDelta = radiusKm / 111.045;
        double lngDelta = radiusKm / (111.045 * Math.max(Math.abs(cosLat), 1e-6));
        Predicate box = cb.and(
                cb.between(root.get("lat"), lat - latDelta, lat + latDelta),
                cb.between(root.get("lng"), lng - lngDelta, lng + lngDelta));

        Expression<Double> rowLatRad = radians(root.get("lat"), cb);
        Expression<Double> rowLngRad = radians(root.get("lng"), cb);
        Expression<Double> cosDistance = cb.sum(
                cb.prod(cb.prod(cb.literal(cosLat), fn("cos", rowLatRad, cb)),
                        fn("cos", cb.diff(rowLngRad, cb.literal(lngRad)), cb)),
                cb.prod(cb.literal(sinLat), fn("sin", rowLatRad, cb)));

        double cosRadius = Math.cos(radiusKm / EARTH_RADIUS_KM);
        return cb.and(box, cb.ge(cosDistance, cosRadius));
    }

    private static final double EARTH_RADIUS_KM = 6371.0;

    static final double LOCALITY_RADIUS_KM = 2.0;

    record LocalityPoint(double lat, double lng) {
    }

    private static Expression<Double> radians(Expression<?> degrees, CriteriaBuilder cb) {
        return cb.function("radians", Double.class, degrees);
    }

    private static Expression<Double> fn(String name, Expression<?> arg, CriteriaBuilder cb) {
        return cb.function(name, Double.class, arg);
    }

    private static Expression<Double> areaSqft(Root<Property> root, CriteriaBuilder cb) {
        Expression<Double> area = root.get("area").as(Double.class);
        Expression<String> unit = cb.lower(cb.coalesce(root.get("areaUnit"), "sqft"));
        return cb.<Double>selectCase()
                .when(cb.equal(unit, "sqyd"), cb.prod(area, 9.0))
                .when(cb.equal(unit, "sqm"), cb.prod(area, 10.7639))
                .when(cb.equal(unit, "guntha"), cb.prod(area, 1089.0))
                .when(cb.equal(unit, "acre"), cb.prod(area, 43560.0))
                .when(cb.equal(unit, "hectare"), cb.prod(area, 107639.1))
                .otherwise(area);
    }

    private static Expression<String> jsonText(String key, Root<Property> root, CriteriaBuilder cb) {
        return cb.function("jsonb_extract_path_text", String.class, root.get("formDetails"),
                cb.literal(key));
    }

    private static Predicate jsonContains(Expression<?> column, String token, CriteriaBuilder cb) {
        return cb.isTrue(cb.function("jsonb_exists", Boolean.class, column, cb.literal(token)));
    }

    private static void anyJsonOrNoPreference(List<String> values, Expression<?> column,
            CriteriaBuilder cb, List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values);
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        List<Predicate> any = new ArrayList<>();
        tokens.forEach(t -> any.add(jsonContains(column, t, cb)));
        any.add(jsonContains(column, "anyone", cb));
        any.add(cb.isNull(column));
        any.add(cb.equal(cb.function("jsonb_array_length", Integer.class, column), 0));
        where.add(cb.or(any.toArray(Predicate[]::new)));
    }

    private static Predicate hasRera(Root<Property> root, CriteriaBuilder cb) {
        return cb.and(cb.isNotNull(root.get("reraId")), cb.notEqual(root.get("reraId"), ""));
    }

    private static Predicate ownershipLive(Root<Property> root, CriteriaBuilder cb, Instant now) {
        return cb.and(
                cb.isTrue(root.get("ownershipVerified")),
                cb.or(
                        cb.isNull(root.get("ownershipVerifiedUntil")),
                        cb.greaterThan(root.get("ownershipVerifiedUntil"), now)));
    }

    static Specification<Property> anyVerified(Instant now) {
        return (root, query, cb) -> cb.or(cb.isTrue(root.get("ownerVerified")), ownershipLive(root, cb, now));
    }

    static Specification<Property> unstatedFiltered(ListingFacets f) {
        return (root, query, cb) -> {
            if (f == null) {
                return cb.disjunction();
            }
            List<Predicate> any = new ArrayList<>();
            if (f.minArea() != null || f.maxArea() != null) {
                any.add(root.get("area").isNull());
            }
            if (f.minBaths() != null && f.minBaths() >= 1) {
                any.add(root.get("bathrooms").isNull());
            }
            if (f.minAge() != null || f.maxAge() != null) {
                any.add(root.get("ageYears").isNull());
            }
            if (f.minFloor() != null || f.maxFloor() != null) {
                any.add(root.get("floor").isNull());
            }
            if (f.minDeposit() != null || f.maxDeposit() != null) {
                any.add(root.get("deposit").isNull());
            }
            return any.isEmpty() ? cb.disjunction() : cb.or(any.toArray(Predicate[]::new));
        };
    }

    private static void in(List<String> values, Expression<String> column, CriteriaBuilder cb,
            List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values);
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        where.add(column.in(tokens));
    }

    private static void idsFacet(List<String> values, Root<Property> root, CriteriaBuilder cb,
            List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values);
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        List<UUID> uuids = tokens.stream().map(PropertyService::tryUuid).filter(Objects::nonNull).toList();
        Predicate bySlug = root.get("slug").in(tokens);
        where.add(uuids.isEmpty() ? bySlug : cb.or(bySlug, root.get("id").in(uuids)));
    }

    private static void inLowerValues(List<String> values, Expression<String> column,
            CriteriaBuilder cb, List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values);
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        where.add(column.in(tokens.stream().map(String::toLowerCase).toList()));
    }

    private static void inFacing(List<String> values, Expression<String> column,
            CriteriaBuilder cb, List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values).stream()
                .map(PropertySpecs::lower)
                .filter(FACING::contains)
                .flatMap(v -> FACING_MATCHES.getOrDefault(v, List.of(v)).stream())
                .distinct()
                .toList();
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        where.add(cb.lower(column).in(tokens));
    }

    private static void inJsonLowerWhitelisted(List<String> values, Set<String> allowed, String key,
            Root<Property> root, CriteriaBuilder cb, List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values).stream()
                .map(PropertySpecs::lower)
                .filter(allowed::contains)
                .toList();
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        where.add(cb.lower(jsonText(key, root, cb)).in(tokens));
    }

    private static final Set<String> SHARE_KEYS = Set.of("flatmates");

    private static void typeFacet(List<String> values, Root<Property> root, CriteriaBuilder cb,
            List<Predicate> where) {
        if (tooMany(values)) {
            where.add(cb.disjunction());
            return;
        }
        List<String> tokens = clean(values);
        if (tokens.isEmpty()) {
            unmatchableIfAsked(values, cb, where);
            return;
        }
        List<Predicate> anyChip = new ArrayList<>();
        List<String> buildingKeys = new ArrayList<>();
        for (String token : tokens) {
            String key = token.toLowerCase();
            if (SHARE_KEYS.contains(key)) {
                anyChip.add(cb.equal(root.get("shareType"), key));
            } else {
                buildingKeys.add(key);
            }
        }
        if (!buildingKeys.isEmpty()) {
            anyChip.add(cb.and(root.get("shareType").isNull(),
                    root.get("propertyTypeKey").in(buildingKeys)));
        }
        where.add(cb.or(anyChip.toArray(new Predicate[0])));
    }

    // A filter used but emptied by sanitising must add a false predicate, or an unmatchable
    // filter returns the whole catalogue.
    private static void unmatchableIfAsked(List<String> values, CriteriaBuilder cb,
            List<Predicate> where) {
        if (values != null && !values.isEmpty()) {
            where.add(cb.disjunction());
        }
    }

    private static List<String> clean(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .filter(v -> v != null && SAFE_TOKEN.matcher(v).matches())
                .toList();
    }

    private static boolean tooMany(List<String> values) {
        return values != null && values.size() > MAX_LIST_TOKENS;
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static final Pattern SAFE_TOKEN = Pattern.compile("[A-Za-z0-9 ._+-]{1,64}");
}
