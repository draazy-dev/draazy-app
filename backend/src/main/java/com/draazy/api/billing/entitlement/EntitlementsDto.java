package com.draazy.api.billing.entitlement;

public record EntitlementsDto(
        ContactEntitlementDto contacts,
        ListingEntitlementDto listings,
        AgreementEntitlementDto agreements) {
}
