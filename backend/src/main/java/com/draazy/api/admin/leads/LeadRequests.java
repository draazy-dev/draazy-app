package com.draazy.api.admin.leads;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class LeadRequests {
    private LeadRequests() {
    }

    public record Profile(String name, String leadType, String intent, List<String> propertyTypes, List<String> bhk,
            String localities, Long budget, String leadSource, String sourceDetail) {
    }

    public record NewLead(String mobile, Profile profile, List<String> interests, String note) {
    }

    public record Contact(String channel, String outcome, String note, Instant nextFollowUpAt) {
    }

    public record StageChange(String stage, String note, Instant nextFollowUpAt) {
    }

    public record Interests(List<String> interests) {
    }

    public record Note(String body) {
    }

    public record Assign(UUID staffId) {
    }

    public record Convert(UUID serviceRequestId) {
    }

    public record Credit(UUID creditedTo) {
    }
}
