package com.draazy.api.engagement.messaging;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.Roles;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MessageTemplateController {
    private static final String STAFF_OR_ADMIN = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private final MessageTemplateRepository templates;

    MessageTemplateController(MessageTemplateRepository templates) {
        this.templates = templates;
    }

    @GetMapping(Routes.Admin.MESSAGE_TEMPLATES)
    @PreAuthorize(STAFF_OR_ADMIN)
    public List<MessageTemplateDto> list(@RequestParam(defaultValue = "whatsapp") String channel) {
        return templates.findByChannelAndActiveTrueOrderByCategoryAscNameAsc(channel).stream()
                .map(MessageTemplateDto::of)
                .toList();
    }
}
