package com.draazy.api.engagement.flatmate;

import java.util.List;

/** The listing wizard's starting answers for an owner's flat, in the wizard's own vocabulary. Null means the source
 * did not say, which the wizard must ask. */
public record OwnerHomePrefillDto(
        String managedId,
        String homeTypeLabel,
        String bhk,
        Boolean gatedCommunity,
        String furnishing,
        String facing,
        String overlooking,
        String locality,
        String localitySlug,
        String society,
        String societyId,
        String flatNumber,
        Double lat,
        Double lng,
        String floor,
        Integer totalFloors,
        Integer floorsInHouse,
        Integer bathrooms,
        Integer balconies,
        List<String> furniture,
        String tower,
        String street,
        String landmark,
        String pincode) {
}
