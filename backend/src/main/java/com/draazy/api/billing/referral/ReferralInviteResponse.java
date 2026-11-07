package com.draazy.api.billing.referral;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReferralInviteResponse(String delivery, String whatsappUrl) {
    static ReferralInviteResponse sent() {
        return new ReferralInviteResponse(ReferralInvite.SENT, null);
    }

    static ReferralInviteResponse openWhatsapp(String url) {
        return new ReferralInviteResponse(ReferralInvite.OPEN_WHATSAPP, url);
    }
}
