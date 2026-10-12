package com.draazy.api.common.settings;

import java.math.BigDecimal;

/** Four named fields rather than the {@code fees} block, whose auto-qualify cap is a fraud threshold that must
 * not be published; naming the four makes that a property of the type, not of a filter. */
public record PricingResponse(
        long listingPass,
        long contactPack,
        long rentAgreementPlatform,
        BigDecimal gstPercent) {
}
