package com.draazy.api.finance.tenancy;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public record TenantVerifiedQuery(@NotNull List<String> mobiles) {
}
