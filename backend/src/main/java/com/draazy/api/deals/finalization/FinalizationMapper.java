package com.draazy.api.deals.finalization;

import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;

public final class FinalizationMapper {
    private FinalizationMapper() {
    }

    public static FinalizationRequestDto toDto(FinalizationRequest request,
                                                User initiator,
                                                User counterparty,
                                                java.util.UUID viewerId,
                                                java.util.Set<java.util.UUID> verifiedUserIds) {
        ContactVisibility initiatorVis = mobileVisibility(viewerId, request.getInitiatorId());
        ContactVisibility counterpartyVis = mobileVisibility(viewerId, request.getCounterpartyId());

        return new FinalizationRequestDto(
                request.getId().toString(),
                request.getPropertyId().toString(),
                toParty(initiator, initiatorVis, "buyer",
                        verifiedUserIds.contains(request.getInitiatorId())),
                toParty(counterparty, counterpartyVis, "owner",
                        verifiedUserIds.contains(request.getCounterpartyId())),
                request.getAgreedPrice(),
                request.getStatus(),
                request.getCreatedAt());
    }

    private static ContactVisibility mobileVisibility(java.util.UUID viewerId,
                                                       java.util.UUID partyId) {
        return viewerId.equals(partyId)
                ? ContactVisibility.REVEALED : ContactVisibility.MASKED;
    }

    private static FinalizationRequestDto.Party toParty(User user, ContactVisibility visibility,
                                                         String role, boolean verified) {
        if (user == null) {
            return null;
        }
        return new FinalizationRequestDto.Party(
                user.getId().toString(),
                user.getName(),
                maskMobile(user.getMobile(), visibility),
                role,
                verified);
    }

    private static String maskMobile(String mobile, ContactVisibility visibility) {
        return MobileMask.applyTo(mobile, visibility);
    }
}
