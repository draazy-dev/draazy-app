package com.draazy.api.common.trust;

import java.util.UUID;

public interface AgreementCreditUsageLookup {
    long agreementCreditsHeld(UUID userId);
}
