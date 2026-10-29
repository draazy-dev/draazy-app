package com.draazy.api.engagement.flatmate;

interface FlatmateSupplyPost extends FlatmateModerated {
    void setAddressFingerprint(String addressFingerprint);

    void setFlagForReview(boolean flagForReview);
}
