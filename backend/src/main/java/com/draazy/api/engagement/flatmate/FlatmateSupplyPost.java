package com.draazy.api.engagement.flatmate;

import java.util.UUID;

interface FlatmateSupplyPost extends FlatmateModerated {
    UUID getId();

    void setAddressFingerprint(String addressFingerprint);

    void setFlagForReview(boolean flagForReview);
}
