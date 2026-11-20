package com.draazy.api.engagement.flatmate;

import jakarta.validation.constraints.NotBlank;

public record FlatmateOwnerNoticeAnswerRequest(@NotBlank String answer) {
}