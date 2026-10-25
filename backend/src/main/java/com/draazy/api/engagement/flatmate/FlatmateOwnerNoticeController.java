package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.Routes;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Anonymous: the owner has no account, and the link token in the header is the whole credential. */
@RestController
public class FlatmateOwnerNoticeController {

    public static final String HEADER = "X-Owner-Notice-Token";

    private final FlatmateOwnerNoticeService service;

    public FlatmateOwnerNoticeController(FlatmateOwnerNoticeService service) {
        this.service = service;
    }

    @GetMapping(Routes.Flatmates.OWNER_NOTICE)
    public FlatmateOwnerNoticeView view(@RequestHeader(name = HEADER, required = false) String token) {
        return service.view(token);
    }

    @PostMapping(Routes.Flatmates.OWNER_NOTICE_ANSWER)
    public FlatmateOwnerNoticeView answer(@RequestHeader(name = HEADER, required = false) String token,
            @Valid @RequestBody FlatmateOwnerNoticeAnswerRequest body) {
        return service.answer(token, body.answer());
    }
}