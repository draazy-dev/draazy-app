package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.Ids;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
class FlatmateEditRules {
    static final Map<Class<?>, Set<String>> SILENT = Map.of(
            FlatmateRoomCreateRequest.class,
            Set.of("attachedBath", "lookingFor", "foodPref", "hostRole", "propertyId",
                    "agreementDeclared", "agreementDoc", "ownerConsentMobile", "ownerConsent",
                    "occupants", "maxOccupants", "gatedCommunity", "parking", "amenities", "details", "society",
                    "localitySlug"),
            FlatmateGroupCreateRequest.class,
            Set.of("locality", "localitySlug", "policy", "rent", "deposit", "noticePeriodDays",
                    "lockInMonths", "maintenanceBilling", "electricityBilling", "seatsOpen", "role",
                    "propertyId", "agreement", "agreementDoc", "consentMobile"),
            FlatmateSeekerPostCreateRequest.class,
            Set.of("gender", "age", "flatPref", "roomPref", "verifiedContactOnly", "furnishing", "gatedOnly",
                    "attachedBath", "parking"));

    FlatmateEditImpact classify(FlatmateRoom room, FlatmateRoomCreateRequest in) {
        boolean remoderationRequired = false;
        List<String> rechecked = new ArrayList<>();

        if (!same(room.getLocality(), in.locality())) {
            remoderationRequired = true;
        }

        if (!same(room.getRoomType(), in.roomType()) || !same(room.getBhk(), in.bhk())) {
            remoderationRequired = true;
        }

        if (!same(room.getFlatNumber(), in.flatNumber())
                || in.societyId() != null
                && !Objects.equals(room.getSocietyId(), Ids.parseUuid(in.societyId().trim()).orElse(null))) {
            rechecked.add("address");
        }

        if (!Objects.equals(room.getLat(), in.lat()) || !Objects.equals(room.getLng(), in.lng())) {
            rechecked.add("map pin");
        }
        if (!Objects.equals(room.getBudget(), in.rentShare())) {
            rechecked.add("rent");
        }
        if (!same(room.getFurnishing(), in.furnishing())) {
            rechecked.add("furnishing");
        }

        if (!same(room.getHomeTypeLabel(), in.homeTypeLabel())) {
            rechecked.add("home type");
        }
        if (!Objects.equals(room.getAvailableFrom(), in.availableFrom())) {
            rechecked.add("availability");
        }

        if (!sameList(room.getPhotos(), in.photos())) {
            rechecked.add("photos");
        }
        if (!same(room.getNote(), in.note())) {
            rechecked.add("note");
        }
        if (!same(room.getTitle(), in.title())) {
            rechecked.add("title");
        }

        if (!same(room.getFacing(), in.facing())
                || !same(room.getOverlooking(), in.overlooking())) {
            rechecked.add("details");
        }

        if (!Objects.equals(room.getDeposit(), in.deposit())
                || !Objects.equals(room.getNoticePeriodDays(), in.noticePeriodDays())
                || !Objects.equals(room.getLockInMonths(), in.lockInMonths())
                || !same(room.getMaintenanceBilling(), in.maintenanceBilling())
                || !same(room.getElectricityBilling(), in.electricityBilling())) {
            rechecked.add("deposit");
        }

        return impact(remoderationRequired, rechecked);
    }

    FlatmateEditImpact classify(FlatmateGroup group, FlatmateGroupCreateRequest in, int seats) {
        List<String> rechecked = new ArrayList<>();
        FlatmateGroupPreferences wanted = in.preferences().normalised();

        // Only a legacy flat-holding group is not hunting; saving it as a team is a new kind of post.
        boolean remoderationRequired = !group.isHunting();

        if (!same(group.getTitle(), in.title())) {
            rechecked.add("title");
        }
        if (!Objects.equals(group.getRent(), wanted.rentMax())) {
            rechecked.add("rent");
        }
        if (!wanted.equals(group.getPreferences())) {
            rechecked.add("preferences");
        }
        if (!same(group.getNote(), in.note())) {
            rechecked.add("note");
        }

        if (group.getSeatsTotal() != seats) {
            rechecked.add("seats");
        }

        return impact(remoderationRequired, rechecked);
    }

    FlatmateEditImpact classify(FlatmateSeekerPost post, FlatmateSeekerPostCreateRequest in,
            String profileName) {
        List<String> rechecked = new ArrayList<>();

        if (!same(post.getName(), profileName)) {
            rechecked.add("name");
        }
        if (!same(post.getOccupation(), in.occupation())) {
            rechecked.add("occupation");
        }
        if (!same(post.getNote(), in.note())) {
            rechecked.add("note");
        }
        if (!same(post.getTitle(), in.title())) {
            rechecked.add("title");
        }
        if (!Objects.equals(post.getBudget(), in.budget())
                || !Objects.equals(post.getBudgetMax(), in.budgetMax())) {
            rechecked.add("budget");
        }

        if (!sameList(post.getLocalities(), FlatmateSeekerService.clean(in.localities()))) {
            rechecked.add("localities");
        }

        if (!same(post.getMoveIn(), in.moveIn())) {
            rechecked.add("details");
        }

        return impact(false, rechecked);
    }

    private static FlatmateEditImpact impact(boolean remoderationRequired, List<String> rechecked) {
        if (!remoderationRequired && rechecked.isEmpty()) {
            return FlatmateEditImpact.SILENT;
        }

        return new FlatmateEditImpact(remoderationRequired,
                !remoderationRequired, List.copyOf(rechecked));
    }

    private static boolean same(String stored, String incoming) {
        return Objects.equals(FlatmateVocabulary.blankToNull(stored),
                FlatmateVocabulary.blankToNull(incoming));
    }

    private static boolean sameList(List<String> stored, List<String> incoming) {
        return Objects.equals(stored == null ? List.of() : stored,
                incoming == null ? List.of() : incoming);
    }
}
