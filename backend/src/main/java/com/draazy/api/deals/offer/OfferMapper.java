package com.draazy.api.deals.offer;

import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class OfferMapper {
    private OfferMapper() {
    }

    public static OfferDto toDto(Offer offer, User buyer, List<OfferHistory> history,
                                  ContactVisibility visibility, boolean verified) {
        return new OfferDto(
                offer.getId().toString(),
                offer.getPropertyId().toString(),
                toParty(buyer, visibility, verified),
                offer.getAmount(),
                offer.getStatus(),
                offer.getMessage(),
                offer.getCreatedAt(),
                offer.getMoveIn(),
                history.stream().map(OfferMapper::toHistoryEntry).toList());
    }

    private static OfferDto.Party toParty(User buyer, ContactVisibility visibility, boolean verified) {
        if (buyer == null) {
            return null;
        }
        return new OfferDto.Party(
                buyer.getId().toString(),
                buyer.getName(),
                maskMobile(buyer.getMobile(), visibility),
                "buyer",
                verified);
    }

    private static OfferDto.HistoryEntry toHistoryEntry(OfferHistory h) {
        return new OfferDto.HistoryEntry(h.getAmount(), h.getBy(), h.getAt());
    }

    private static String maskMobile(String mobile, ContactVisibility visibility) {
        return MobileMask.applyTo(mobile, visibility);
    }
}
