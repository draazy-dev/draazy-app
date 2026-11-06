package com.draazy.api.services.support;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class StaffSupportChatDto {
    private StaffSupportChatDto() {
    }

    public record Person(UUID id, String name) {
    }

    public record Row(UUID userId, String name, String status, Person assignee, boolean staffUnread,
            Instant lastAt, String lastPreview, String lastFrom, SupportChatDto.About lastAbout) {
    }

    public record Scope(boolean full, List<String> contexts) {
    }

    public record Counts(long awaiting, long mine, long all, Scope scope) {
    }

    public record Customer(UUID id, String name, String mobile, boolean idVerified, List<String> roles) {
    }

    public record Detail(Customer user, String status, Person assignee, List<SupportChatDto.Msg> messages,
            List<SupportChatDto.Case> cases) {
    }

    public record Assign(UUID assigneeId) {
    }

    public record Located(UUID userId, String name, int count) {
    }

    public record ServiceTicketPost(
            @NotBlank @Size(max = 32) String team,
            @NotBlank @Size(max = 200) String subject,
            @Size(max = 4000) String note,
            @Size(max = 64) String propertyId) {
    }

    public record ServiceTicketCreated(String id, String team) {
    }
}
