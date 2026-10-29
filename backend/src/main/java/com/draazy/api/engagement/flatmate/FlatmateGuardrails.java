package com.draazy.api.engagement.flatmate;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class FlatmateGuardrails {
    public static final int MAX_ACTIVE_HOST_POSTS = 3;

    public static final String PROPERTY_PREFIX = "prop:";

    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;

    public FlatmateGuardrails(FlatmateRoomRepository rooms, FlatmateGroupRepository groups) {
        this.rooms = rooms;
        this.groups = groups;
    }

    public HostEligibility evaluate(UUID hostId, String tier, Address address) {
        String fingerprint = fingerprint(address);
        boolean ownerTier = FlatmateVocabulary.TIER_OWNER.equals(tier);

        long held = rooms.countCappedByHost(hostId) + groups.countCappedByHost(hostId);
        boolean overCap = !ownerTier && held >= MAX_ACTIVE_HOST_POSTS;

        List<Claim> claims = claims(fingerprint);
        boolean duplicate = claims.stream().anyMatch(c -> c.hostId().equals(hostId));
        boolean contested = claims.stream().anyMatch(c -> !c.hostId().equals(hostId));

        String reason;
        if (overCap) {
            reason = "You already have " + MAX_ACTIVE_HOST_POSTS + " live flatmate posts. "
                    + "Fill or close one before posting another.";
        } else if (duplicate) {
            reason = "You already have a live flatmate post for this address.";
        } else {
            reason = "";
        }

        return new HostEligibility(overCap || duplicate, overCap, duplicate, contested,
                fingerprint, reason);
    }

    public boolean capBlocksReopen(UUID hostId, String tier) {
        return evaluate(hostId, tier, null).overCap();
    }

    public static RuntimeException reopenRefused() {
        return new FlatmateSupplyService.HostBlockedException(new HostEligibility(true, true, false, false,
                null, "You already have " + MAX_ACTIVE_HOST_POSTS
                        + " live flatmate posts. Close one before reopening this."));
    }

    public String fingerprint(Address address) {
        if (address == null) {
            return null;
        }
        if (address.propertyId() != null) {
            return PROPERTY_PREFIX + address.propertyId();
        }
        String locality = normalise(address.locality());
        String society = normalise(address.society());
        String title = normalise(address.title());
        if (locality.isEmpty()) {
            return null;
        }
        if (!society.isEmpty()) {
            return "addr:" + society + "|" + locality;
        }
        if (!title.isEmpty()) {
            return "addr:" + title + "|" + locality;
        }
        return null;
    }

    private List<Claim> claims(String fingerprint) {
        List<Claim> found = new ArrayList<>();
        if (fingerprint == null) {
            return found;
        }
        rooms.findByAddressFingerprintAndArchivedFalseOrderByIdAsc(fingerprint)
                .forEach(r -> found.add(new Claim(r.getHostId(), "room", r.getId())));
        groups.findByAddressFingerprintAndArchivedFalseOrderByIdAsc(fingerprint)
                .forEach(g -> found.add(new Claim(g.getHostId(), "group", g.getId())));
        return found;
    }

    private static String normalise(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String decomposed = Normalizer.normalize(value.strip(), Normalizer.Form.NFD);
        return decomposed
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .strip();
    }

    public record Address(UUID propertyId, String society, String locality, String title) {
    }

    public record HostEligibility(boolean blocked, boolean overCap, boolean duplicate,
            boolean flagForReview, String fingerprint, String reason) {
    }

    private record Claim(UUID hostId, String kind, UUID id) {
    }
}
