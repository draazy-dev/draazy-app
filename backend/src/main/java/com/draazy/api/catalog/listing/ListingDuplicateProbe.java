package com.draazy.api.catalog.listing;

import static com.draazy.api.common.PlatformTime.IST;

import com.draazy.api.catalog.property.AddressKey;
import com.draazy.api.catalog.property.MeterKey;
import com.draazy.api.catalog.property.PhotoHash;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyPhotoHash;
import com.draazy.api.catalog.property.PropertyPhotoHashRepository;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.trust.ListingCaseNotes;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListingDuplicateProbe {
    private static final List<String> OCCUPYING = PropertyStatus.OCCUPYING_DUPLICATE_STATUSES;

    private static final int PHOTO_CANDIDATE_CAP = 200;

    private final PropertyRepository properties;
    private final PropertyPhotoHashRepository photoHashes;
    private final ListingCaseNotes caseNotes;

    public ListingDuplicateProbe(PropertyRepository properties,
            PropertyPhotoHashRepository photoHashes, ListingCaseNotes caseNotes) {
        this.properties = properties;
        this.photoHashes = photoHashes;
        this.caseNotes = caseNotes;
    }

    public void reindex(Property p) {
        p.setAddressKey(AddressKey.of(p.getAddress(), p.getCity(), p.getLocality()));
        p.setElectricityMeterKey(MeterKey.of(p.getElectricityMeterNo()));
    }

    public List<Object> signalOf(Property p) {
        return Arrays.asList(p.getElectricityMeterKey(), p.getAddressKey(), p.getLocalitySlug());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void flag(Property p) {
        flagSameDoorway(p);
        flagSamePhotos(p);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean reindexPhotos(Property p, List<String> hexes) {
        if (hexes == null) {
            return false;
        }
        Set<Long> parsed = new LinkedHashSet<>();
        for (String hex : hexes) {
            Long h = PhotoHash.parse(hex);
            if (h != null) {
                parsed.add(h);
            }
            if (parsed.size() >= PhotoHash.MAX_PER_LISTING) {
                break;
            }
        }
        Set<Long> stored = photoHashes.findByPropertyId(p.getId()).stream()
                .map(PropertyPhotoHash::getHash).collect(Collectors.toSet());
        if (stored.equals(parsed)) {
            return false;
        }
        photoHashes.deleteByPropertyId(p.getId());

        photoHashes.flush();
        List<PropertyPhotoHash> rows = new ArrayList<>();
        for (Long h : parsed) {
            rows.add(new PropertyPhotoHash(p.getId(), h));
        }
        photoHashes.saveAll(rows);
        return true;
    }

    private void flagSameDoorway(Property p) {
        if (p.getElectricityMeterKey() == null && p.getAddressKey() == null) {
            return;
        }
        List<Property> hits = properties.findDuplicateCandidates(
                p.getOwner().getId(), OCCUPYING,
                p.getElectricityMeterKey(), p.getAddressKey(), p.getLocalitySlug(),

                PageRequest.of(0, 2));
        if (hits.isEmpty()) {
            return;
        }

        String others = hits.stream().map(ListingDuplicateProbe::describe).sorted()
                .collect(Collectors.joining("; "));
        caseNotes.postInternalOnce(p.getId(), p.getDeal(),
                "Possible duplicate. This listing (" + describe(p) + ") matches an active listing by"
                        + " another owner: " + others + ". " + nextStep(p));
    }

    private void flagSamePhotos(Property p) {
        List<PropertyPhotoHash> mine = photoHashes.findByPropertyId(p.getId());
        if (mine.isEmpty()) {
            return;
        }
        Set<Integer> bands0 = new LinkedHashSet<>();
        Set<Integer> bands1 = new LinkedHashSet<>();
        Set<Integer> bands2 = new LinkedHashSet<>();
        Set<Integer> bands3 = new LinkedHashSet<>();
        for (PropertyPhotoHash h : mine) {
            int[] b = PhotoHash.bands(h.getHash());
            bands0.add(b[0]);
            bands1.add(b[1]);
            bands2.add(b[2]);
            bands3.add(b[3]);
        }
        List<PropertyPhotoHash> candidates = photoHashes.findBandCandidates(
                p.getOwner().getId(), OCCUPYING, bands0, bands1, bands2, bands3,
                PageRequest.of(0, PHOTO_CANDIDATE_CAP));
        Set<UUID> matched = new LinkedHashSet<>();
        for (PropertyPhotoHash c : candidates) {
            for (PropertyPhotoHash m : mine) {
                if (PhotoHash.sameShot(m.getHash(), c.getHash())) {
                    matched.add(c.getPropertyId());
                    break;
                }
            }
        }
        if (matched.isEmpty()) {
            return;
        }

        String others = properties.findAllById(matched).stream()
                .map(ListingDuplicateProbe::describe).sorted().limit(2)
                .collect(Collectors.joining("; "));
        caseNotes.postInternalOnce(p.getId(), p.getDeal(),
                "Possible duplicate. This listing (" + describe(p) + ") reuses photographs from an"
                        + " active listing by another owner: " + others + "."
                        + " Photographs are a weaker signal than an address — the same lobby or"
                        + " amenity shot can honestly appear on two listings. " + nextStep(p));
    }

    private static String describe(Property p) {
        String ref = p.getSlug() == null ? p.getId().toString() : p.getSlug();
        return ref + " [" + p.getStatus()
                + (p.isOwnerVerified() ? ", owner verified" : ", owner unverified")
                + (p.getCreatedAt() == null ? ""

                        : ", listed " + p.getCreatedAt().atZone(IST).toLocalDate())
                + "]";
    }

    private static String nextStep(Property p) {
        return PropertyStatus.PENDING.equals(p.getStatus())
                ? "Confirm who holds the mandate before approving."
                : "This listing is already live — it moved onto this address by edit. Decide whether"
                        + " it should stay up.";
    }

    @Transactional
    public int resweepRecent(Instant since, int limit) {
        List<Property> recent =
                properties.findRecentSignalCarrying(since, OCCUPYING, PageRequest.of(0, limit));
        recent.forEach(this::flag);
        return recent.size();
    }

    @Transactional(readOnly = true)
    public ListingDuplicateVerdict ownDuplicate(UUID ownerId, String meter,
            String addressKey, String localitySlug) {
        if (meter == null && addressKey == null) {
            return ListingDuplicateVerdict.NONE;
        }

        List<Property> hits = properties.findOwnDuplicateCandidates(
                ownerId, OCCUPYING, meter, addressKey, localitySlug, PageRequest.of(0, 1));
        if (hits.isEmpty()) {
            return ListingDuplicateVerdict.NONE;
        }
        Property hit = hits.get(0);
        return new ListingDuplicateVerdict(true, hit.getId().toString());
    }
}
