package com.draazy.api.engagement.messaging;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.trust.MessageSender;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ClickToChatSender implements MessageSender {
    private static final String COUNTRY_CODE = "91";

    private final MessageTemplateRepository templates;
    private final OutboundMessageRepository ledger;

    ClickToChatSender(MessageTemplateRepository templates, OutboundMessageRepository ledger) {
        this.templates = templates;
        this.ledger = ledger;
    }

    @Override
    @Transactional
    public Prepared send(MessageRequest request) {
        MessageTemplate template = templates
                .findById(request.templateId())
                .filter(MessageTemplate::isActive)
                .orElseThrow(() -> new BadRequestException(
                        "No active message template called '" + request.templateId() + "'."));

        String body = template.render(request.variables());

        OutboundMessage row = ledger.save(new OutboundMessage(
                request.channel(),
                template.getId(),
                request.subjectType(),
                request.subjectId(),
                request.recipientId(),
                request.recipientMobile(),
                body,
                request.preparedBy()));

        return new Prepared(row.getId(), body, row.getStatus(), link(request.recipientMobile(), body));
    }

    // Fewer than ten digits means a masked number reached here; refuse rather than link to a stranger.
    private String link(String mobile, String body) {
        String digits = mobile.replaceAll("\\D", "");
        if (digits.length() < 10) {
            throw new BadRequestException("Cannot open a WhatsApp chat: the recipient's mobile is incomplete.");
        }
        String national = digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
        return "https://wa.me/" + COUNTRY_CODE + national + "?text="
                + URLEncoder.encode(body, StandardCharsets.UTF_8);
    }
}
