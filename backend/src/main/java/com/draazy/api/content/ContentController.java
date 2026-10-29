package com.draazy.api.content;

import com.draazy.api.common.web.Routes;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ContentController {
    private final ContentService contentService;

    public ContentController(ContentService contentService) {
        this.contentService = contentService;
    }

    @GetMapping(Routes.Content.FAQS)
    public List<FaqResponse> faqs() {
        return contentService.listFaqs();
    }
    }