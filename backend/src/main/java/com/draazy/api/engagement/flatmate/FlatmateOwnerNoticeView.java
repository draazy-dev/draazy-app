package com.draazy.api.engagement.flatmate;

public record FlatmateOwnerNoticeView(String tenantName, String society, String locality,
        String roomType, Long rent, String status, boolean homeSaved) {
}