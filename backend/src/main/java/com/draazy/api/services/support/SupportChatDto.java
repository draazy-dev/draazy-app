package com.draazy.api.services.support;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class SupportChatDto {
    private SupportChatDto() {
    }

    public record About(String type, String id, String label) {
    }

    public record Msg(String id, String from, String staffName, String text, Instant at, About about) {
    }

    public record Case(String type, String id, String label, String status, boolean replyable) {
    }

    public record Assignee(String name) {
    }

    public record View(String status, int unread, Assignee assignee, List<Msg> messages, List<Case> cases) {
    }

    public record AboutRef(@NotBlank @Size(max = 32) String type, @Size(max = 64) String id) {
    }

    public record Post(@NotBlank @Size(max = 4000) String text, @Valid AboutRef about) {
    }
}
