package com.draazy.api.finance.tenancy;

// Carries only a flag: this is asked about a whole list, so any extra field would leak
// income or occupation in bulk.
public record TenantVerifiedDto(String mobile, boolean verified) {
}
