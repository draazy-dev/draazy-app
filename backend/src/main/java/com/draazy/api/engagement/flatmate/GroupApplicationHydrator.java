package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Shared by the staff board and the owner inbox so the batched joins live once. A missing listing or group
 * hydrates as nulls, not an error: moderators must still see an orphaned row to clear it. */
@Component
class GroupApplicationHydrator {

    private final PropertyRepository properties;
    private final FlatmateGroupRepository groups;
    private final UserRepository users;

    GroupApplicationHydrator(PropertyRepository properties, FlatmateGroupRepository groups,
            UserRepository users) {
        this.properties = properties;
        this.groups = groups;
        this.users = users;
    }

    /** Join the listing and group facts each row renders, batched rather than per row. */
    List<GroupApplicationDto> hydrate(List<FlatmateGroupApplication> rows) {
        return hydrate(rows, false);
    }

    List<GroupApplicationDto> hydrateForStaff(List<FlatmateGroupApplication> rows) {
        return hydrate(rows, true);
    }

    private List<GroupApplicationDto> hydrate(List<FlatmateGroupApplication> rows, boolean staff) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, Property> listings = properties.findAllById(
                        rows.stream().map(FlatmateGroupApplication::getListingId).distinct().toList())
                .stream().collect(Collectors.toMap(Property::getId, p -> p));
        Map<UUID, FlatmateGroup> byGroup = groups.findAllById(
                        rows.stream().map(FlatmateGroupApplication::getGroupId).distinct().toList())
                .stream().collect(Collectors.toMap(FlatmateGroup::getId, g -> g));
        Map<UUID, User> applicants = users.findAllById(
                        rows.stream().map(FlatmateGroupApplication::getApplicantId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, u -> u));

        return rows.stream().map(row -> {
            Property listing = listings.get(row.getListingId());
            FlatmateGroup group = byGroup.get(row.getGroupId());
            User applicant = applicants.get(row.getApplicantId());
            return GroupApplicationDto.of(row,
                    listing == null ? null : listing.getTitle(),
                    listing == null ? null : listing.getLocality(),
                    listing == null ? null : listing.getPrice(),
                    group == null ? null : group.getTitle(),
                    applicant == null ? null : applicant.getName(),
                    staff && applicant != null ? applicant.getMobile() : null,
                    group == null ? 0 : group.getMembers().size(),
                    group == null ? 0 : group.getSeatsTotal());
        }).toList();
    }

    /** One row, for the two write paths that return the thing they just changed. */
    GroupApplicationDto hydrateOne(FlatmateGroupApplication row) {
        return hydrate(List.of(row)).getFirst();
    }

    GroupApplicationDto hydrateOneForStaff(FlatmateGroupApplication row) {
        return hydrateForStaff(List.of(row)).getFirst();
    }
}
