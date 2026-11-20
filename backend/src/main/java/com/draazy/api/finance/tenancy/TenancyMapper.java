package com.draazy.api.finance.tenancy;

import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;

public final class TenancyMapper {
    private TenancyMapper() {
    }

    public static TenancyDto toDto(Tenancy tenancy, User tenant, User owner) {
        return new TenancyDto(
                tenancy.getId().toString(),
                tenancy.getPropertyId().toString(),
                toParty(tenant, "tenant", true),
                toParty(owner, "owner", !TenancyStatuses.PENDING.equals(tenancy.getStatus())),
                tenancy.getRent(),
                tenancy.getDeposit(),
                tenancy.getStartDate(),
                tenancy.getEndDate(),
                tenancy.getStatus());
    }

    // Deliberately no mobile: a claim must not mint a contact reveal.
    public static TenancyDeclarationDto toDto(TenancyDeclaration declaration, User declarant) {
        return new TenancyDeclarationDto(
                declaration.getId().toString(),
                declaration.getPropertyId().toString(),
                declaration.getDeclarantId().toString(),
                declarant == null ? "" : declarant.getName(),
                declaration.getLivedFrom(),
                declaration.getLivedTo(),
                declaration.getStatus(),
                declaration.getDecidedAt());
    }

    public static TenantProfileDto toDto(TenantProfile profile, String mobile, boolean self) {
        return new TenantProfileDto(
                maskMobile(mobile, self ? ContactVisibility.REVEALED : ContactVisibility.MASKED),
                profile.getName(),
                profile.getOccupation(),
                profile.getIncome(),
                profile.getOccupants(),
                profile.getMoveIn(),
                profile.getPriorLandlord(),
                profile.getAbout(),
                profile.getScore(),
                profile.isVerified());
    }

    public static TenantProfileDto emptyProfile(String mobile, boolean verified) {
        return new TenantProfileDto(
                maskMobile(mobile, ContactVisibility.REVEALED),
                null, null, null, null, null, null, null, null, verified);
    }

    private static TenancyDto.Party toParty(User user, String role, boolean revealed) {
        if (user == null) {
            return null;
        }
        return new TenancyDto.Party(
                user.getId().toString(),
                user.getName(),
                maskMobile(user.getMobile(), revealed ? ContactVisibility.REVEALED : ContactVisibility.MASKED),
                role);
    }

    private static String maskMobile(String mobile, ContactVisibility visibility) {
        return MobileMask.applyTo(mobile, visibility);
    }
}
