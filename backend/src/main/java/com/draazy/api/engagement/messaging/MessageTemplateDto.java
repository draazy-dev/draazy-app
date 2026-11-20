package com.draazy.api.engagement.messaging;

public record MessageTemplateDto(String id, String channel, String category, String name, String body) {
    static MessageTemplateDto of(MessageTemplate template) {
        return new MessageTemplateDto(
                template.getId(),
                template.getChannel(),
                template.getCategory(),
                template.getName(),
                template.getBody());
    }
}
