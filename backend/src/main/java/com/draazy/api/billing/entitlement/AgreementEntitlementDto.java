package com.draazy.api.billing.entitlement;

public record AgreementEntitlementDto(int credits, int used, int remaining, int discountPercent) {
}