package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.ListingLiveGate;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.ListingAllowanceLookup;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListingQuota implements ListingLiveGate {

    private static final Duration PACE_WINDOW = Duration.ofDays(1);

    private final PropertyRepository properties;
    private final ListingAllowanceLookup allowances;
    private final RateLimitLock locks;
    private final int maxPostsPerDay;

    public ListingQuota(PropertyRepository properties, ListingAllowanceLookup allowances, RateLimitLock locks,
            @Value("${draazy.listings.max-posts-per-day:3}") int maxPostsPerDay) {
        this.properties = properties;
        this.allowances = allowances;
        this.locks = locks;
        this.maxPostsPerDay = maxPostsPerDay;
    }

    public void requirePace(UUID userId) {
        if (properties.countPostedSince(userId, Instant.now().minus(PACE_WINDOW)) >= maxPostsPerDay) {
            throw new RateLimitedException("You can post up to " + maxPostsPerDay
                    + " new listings a day. Please try again tomorrow.", (int) PACE_WINDOW.toSeconds());
        }
    }

    @Override
    public boolean mayGoLive(Property property) {
        return mayGoLive(property, Instant.now());
    }

    /** Pass-covered listings always may; others need a free slot beside the owner's other uncovered live
     * ones. Holds the owner's slot lock to commit, so two listings cannot both take the last slot. */
    @Transactional
    public boolean mayGoLive(Property property, Instant now) {
        UUID ownerId = property.getOwner().getId();
        locks.holdUntilCommit(RateLimitLock.Limit.LISTING_LIVE, ownerId.toString());
        if (properties.hasActivePass(property.getId(), now)) {
            return true;
        }
        long others = properties.countLiveUncovered(
                ownerId, PropertyStatus.OCCUPIES_LISTING_SLOT, property.getId(), now);
        return others < allowances.listingAllowance(ownerId);
    }

    /** The owner's uncovered live listings past their allowance; the oldest are kept. */
    @Transactional
    public List<UUID> liveBeyondAllowance(UUID ownerId, Instant now) {
        locks.holdUntilCommit(RateLimitLock.Limit.LISTING_LIVE, ownerId.toString());
        List<UUID> live = properties.findLiveUncoveredIds(ownerId, PropertyStatus.OCCUPIES_LISTING_SLOT, now);
        int keep = allowances.listingAllowance(ownerId);
        return live.size() <= keep ? List.of() : live.subList(keep, live.size());
    }

    /** How much of their free tier an owner ({@code userId}, not the caller) is using, so the
     * concierge desk can judge instead of refusing. */
    @Transactional(readOnly = true)
    public ListingStanding standingFor(UUID userId) {
        return new ListingStanding(allowances.listingAllowance(userId),
                properties.countLiveUncovered(userId, Instant.now()));
    }

    public record ListingStanding(int allowance, long held) {

        public boolean overAllowance() {
            return held > allowance;
        }
    }
}
