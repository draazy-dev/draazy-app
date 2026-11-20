package com.draazy.api.provider.whatsapp;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("draazy.providers.whatsapp")
public record WhatsAppProperties(
        boolean enabled,
        String baseUrl,
        String apiVersion,
        String phoneNumberId,
        String accessToken,
        String otpTemplateName,
        String otpTemplateLang,
        String identityTemplateName,
        String identityTemplateLang,
        String digestTemplateName,
        String digestTemplateLang,
        String ownerNoticeTemplateName,
        String ownerNoticeTemplateLang,
        String ownerNoticePhoneNumberId,
        String serviceTemplateName,
        String serviceTemplateLang,
        String agreementInviteTemplateName,
        String agreementInviteTemplateLang,
        String referralInviteTemplateName,
        String referralInviteTemplateLang,
        String referralInvitePhoneNumberId) {
    public String ownerNoticeSender() {
        return ownerNoticePhoneNumberId == null || ownerNoticePhoneNumberId.isBlank()
                ? phoneNumberId : ownerNoticePhoneNumberId;
    }

    public String referralInviteSender() {
        return referralInvitePhoneNumberId == null || referralInvitePhoneNumberId.isBlank()
                ? phoneNumberId : referralInvitePhoneNumberId;
    }

    @Override
    public String toString() {
        return "WhatsAppProperties[enabled=" + enabled
                + ", baseUrl=" + baseUrl
                + ", apiVersion=" + apiVersion
                + ", phoneNumberId=" + phoneNumberId
                + ", accessToken=" + (accessToken == null || accessToken.isBlank()
                        ? "unset" : "<redacted>")
                + ", otpTemplateName=" + otpTemplateName
                + ", otpTemplateLang=" + otpTemplateLang
                + ", identityTemplateName=" + identityTemplateName
                + ", identityTemplateLang=" + identityTemplateLang
                + ", digestTemplateName=" + digestTemplateName
                + ", digestTemplateLang=" + digestTemplateLang
                + ", ownerNoticeTemplateName=" + ownerNoticeTemplateName
                + ", ownerNoticeTemplateLang=" + ownerNoticeTemplateLang
                + ", ownerNoticePhoneNumberId=" + ownerNoticePhoneNumberId
                + ", serviceTemplateName=" + serviceTemplateName
                + ", serviceTemplateLang=" + serviceTemplateLang
                + ", agreementInviteTemplateName=" + agreementInviteTemplateName
                + ", agreementInviteTemplateLang=" + agreementInviteTemplateLang
                + ", referralInviteTemplateName=" + referralInviteTemplateName
                + ", referralInviteTemplateLang=" + referralInviteTemplateLang
                + ", referralInvitePhoneNumberId=" + referralInvitePhoneNumberId + "]";
    }
}
