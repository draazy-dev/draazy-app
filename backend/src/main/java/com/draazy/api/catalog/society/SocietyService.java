package com.draazy.api.catalog.society;

import com.draazy.api.catalog.property.Freshness;
import com.draazy.api.catalog.property.ListingCounts;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.RatingLookup;
import com.draazy.api.identity.user.UserStatuses;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocietyService {
    private static final int HUB_HOMES = 6;

    private final SocietyRepository societies;
    private final PropertyRepository properties;
    private final ListingCounts listingCounts;
    private final SocietyMapper societyMapper;
    private final RatingLookup ratings;

    public SocietyService(SocietyRepository societies, PropertyRepository properties,
            ListingCounts listingCounts, SocietyMapper societyMapper, RatingLookup ratings) {
        this.societies = societies;
        this.properties = properties;
        this.listingCounts = listingCounts;
        this.societyMapper = societyMapper;
        this.ratings = ratings;
    }

    @Transactional(readOnly = true)
    public Page<SocietyResponse> browse(String q, String localitySlug, Boolean hasListings, Boolean mapped,
            Pageable pageable) {
        Specification<Society> spec = SocietySpecs.browse(q, localitySlug, hasListings, mapped);
        Optional<String> ranking = SocietySort.ranking(pageable);
        if (ranking.isPresent()) {
            return ranked(spec, q, localitySlug, hasListings, mapped, ranking.get(), pageable);
        }
        Pageable safe = SocietySort.sanitize(pageable);
        Page<Society> page = societies.findAll(spec, SocietySort.tieBroken(safe));
        List<SocietyResponse> rows = summarise(page.getContent());
        return new PageImpl<>(rows, safe, page.getTotalElements());
    }

    private Page<SocietyResponse> ranked(Specification<Society> spec, String q, String localitySlug,
            Boolean hasListings, Boolean mapped, String mode, Pageable pageable) {
        List<Object[]> rows = societies.rankedIds(SocietySpecs.likePattern(q), SocietySpecs.trimmed(localitySlug),
                Boolean.TRUE.equals(hasListings), Boolean.TRUE.equals(mapped), mode,
                pageable.getPageSize(), pageable.getOffset(), Freshness.dormantCutoff(Instant.now()));
        List<UUID> ids = rows.stream().map(r -> (UUID) r[0]).toList();
        long total = rows.isEmpty()
                ? (pageable.getPageNumber() == 0 ? 0 : societies.count(spec))
                : ((Number) rows.get(0)[1]).longValue();
        Map<UUID, Society> byId = societies.findAllById(ids).stream()
                .collect(Collectors.toMap(Society::getId, s -> s));
        List<Society> ordered = ids.stream().map(byId::get).toList();
        Pageable echoed = PageRequest.of(
                pageable.getPageNumber(), pageable.getPageSize(), Sort.by(Sort.Direction.DESC, mode));
        return new PageImpl<>(summarise(ordered), echoed, total);
    }

    @Transactional(readOnly = true)
    public List<SocietyResponse> summarise(List<Society> page) {
        Tallies tallies = tallies(page.stream().map(Society::getId).toList());
        return page.stream().map(society -> {
            RatingLookup.Rating rating = tallies.rating(society.getId());
            return societyMapper.toResponse(
                    society,
                    tallies.homes(society.getId()),
                    rating == null ? null : rating.average(),
                    rating == null ? 0L : rating.reviewCount());
        }).toList();
    }

    private record Tallies(Map<UUID, List<UUID>> families, Map<UUID, Long> listings,
            Map<UUID, RatingLookup.Rating> rated) {
        long homes(UUID id) {
            return sum(listings, families.get(id));
        }

        RatingLookup.Rating rating(UUID id) {
            return combinedRating(rated, families.get(id));
        }
    }

    private Tallies tallies(List<UUID> ids) {
        Map<UUID, List<UUID>> families = families(ids);
        List<UUID> reach = families.values().stream().flatMap(List::stream).toList();
        return new Tallies(families, listingCounts.bySocietyIds(reach), ratings.forSocieties(reach));
    }

    @Transactional(readOnly = true)
    public Map<UUID, Long> homeCounts(List<UUID> ids) {
        Map<UUID, List<UUID>> families = families(ids);
        Map<UUID, Long> listings = listingCounts.bySocietyIds(
                families.values().stream().flatMap(List::stream).toList());
        return ids.stream().distinct()
                .collect(Collectors.toMap(id -> id, id -> sum(listings, families.get(id))));
    }

    @Transactional(readOnly = true)
    public SocietyDetailResponse get(String slug) {
        Society society = live(slug);
        List<UUID> family = families(List.of(society.getId())).get(society.getId());
        List<SocietyHome> homes = properties
                .visibleSocietyHomes(family, PropertyStatus.APPROVED, UserStatuses.SUSPENDED,
                        Freshness.dormantCutoff(Instant.now()), PageRequest.of(0, HUB_HOMES))
                .stream()
                .map(p -> new SocietyHome(p.getId(), p.getSlug(), p.getTitle(), p.getDeal(), p.getBhk(),
                        p.getPrice(), p.getArea()))
                .toList();
        SocietyHomeStats stats = SocietyHomeStats.of(
                properties.societyHomeStats(PropertyStatus.APPROVED, family,
                        Freshness.dormantCutoff(Instant.now())).getFirst());
        return societyMapper.toDetail(society, stats, homes);
    }

    @Transactional(readOnly = true)
    public SocietyBrief brief(String slug) {
        Society society = live(slug);
        List<UUID> family = families(List.of(society.getId())).get(society.getId());
        RatingLookup.Rating rating = combinedRating(ratings.forSocieties(family), family);
        return societyMapper.toBrief(society,
                rating == null ? null : rating.average(),
                rating == null ? 0L : rating.reviewCount());
    }

    private Society live(String slug) {
        Society society = SocietyMergePointer.survivor(societies, societies.findBySlug(slug)
                .orElseThrow(() -> NotFoundException.of("Society")));
        if (society.getArchivedAt() != null) {
            throw NotFoundException.of("Society");
        }
        return society;
    }

    private Map<UUID, List<UUID>> families(List<UUID> survivorIds) {
        Map<UUID, List<UUID>> families = new LinkedHashMap<>();
        for (UUID id : survivorIds) {
            families.put(id, new ArrayList<>(List.of(id)));
        }
        if (survivorIds.isEmpty()) {
            return families;
        }
        for (Object[] row : societies.findMergedInto(survivorIds)) {
            families.get((UUID) row[0]).add((UUID) row[1]);
        }
        return families;
    }

    private static long sum(Map<UUID, Long> counts, List<UUID> family) {
        return family.stream().mapToLong(id -> counts.getOrDefault(id, 0L)).sum();
    }

    private static RatingLookup.Rating combinedRating(
            Map<UUID, RatingLookup.Rating> rated, List<UUID> family) {
        if (family.size() == 1) {
            return rated.get(family.get(0));
        }
        BigDecimal weighted = BigDecimal.ZERO;
        long reviews = 0;
        for (UUID id : family) {
            RatingLookup.Rating one = rated.get(id);
            if (one == null || one.reviewCount() == 0) {
                continue;
            }
            weighted = weighted.add(one.average().multiply(BigDecimal.valueOf(one.reviewCount())));
            reviews += one.reviewCount();
        }
        if (reviews == 0) {
            return null;
        }
        return new RatingLookup.Rating(
                weighted.divide(BigDecimal.valueOf(reviews), 2, RoundingMode.HALF_UP), reviews);
    }
}
