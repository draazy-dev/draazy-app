package com.draazy.api.deals.deal;

import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;

public final class DealMapper {
    private DealMapper() {
    }

    public static DealDto toDto(Deal deal, User counterparty) {
        return new DealDto(
                deal.getId().toString(),
                deal.getPropertyId().toString(),
                deal.getDeal(),
                toCounterpartyParty(deal, counterparty),
                deal.getAgreedPrice(),
                deal.getStatus(),
                deal.getClosedAt());
    }

    public static DealDto synthesizeActive(String propertyId, String dealIntent) {
        return new DealDto(
                null,
                propertyId,
                dealIntent,
                null,
                null,
                DealStatuses.ACTIVE,
                null);
    }

    public static DealPartyDto toPartyDto(DealParty party) {
        return new DealPartyDto(
                party.getId().toString(),
                party.getName(),
                party.getMobile(),
                party.getNote(),
                party.getCreatedAt());
    }

    private static DealDto.Party toCounterpartyParty(Deal deal, User counterparty) {
        if (deal.getCounterpartyMobile() == null && counterparty == null) {
            return null;
        }
        String mobile = deal.getCounterpartyMobile();
        String maskedOrRevealed = maskMobile(mobile, ContactVisibility.REVEALED);
        return new DealDto.Party(
                counterparty != null ? counterparty.getId().toString() : null,
                counterparty != null ? counterparty.getName() : null,
                maskedOrRevealed,
                "buyer");
    }

    private static String maskMobile(String mobile, ContactVisibility visibility) {
        return MobileMask.applyTo(mobile, visibility);
    }
}
