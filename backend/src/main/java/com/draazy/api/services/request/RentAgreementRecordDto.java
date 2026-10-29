package com.draazy.api.services.request;

public record RentAgreementRecordDto(
        String id,
        String tenantName,
        String tenantMobile,
        String status,
        String preparedBy,
        String verifiedBy,
        boolean preparedByYou,
        String documentId,
        boolean otpVerified) {
}
