package com.draazy.api.services.support;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.services.support.SupportChatDto.Msg;
import com.draazy.api.services.support.SupportChatDto.Post;
import com.draazy.api.services.support.SupportChatDto.View;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SupportChatController {
    private final SupportChatService service;

    public SupportChatController(SupportChatService service) {
        this.service = service;
    }

    @GetMapping(Routes.SupportChat.BASE)
    public View view(@CurrentUser AuthPrincipal principal) {
        return service.view(principal);
    }

    @GetMapping(Routes.SupportChat.UNREAD_COUNT)
    public SupportChatService.UnreadCount unreadCount(@CurrentUser AuthPrincipal principal) {
        return service.unreadCount(principal);
    }

    @PostMapping(Routes.SupportChat.MESSAGES)
    @ResponseStatus(HttpStatus.CREATED)
    public Msg send(@CurrentUser AuthPrincipal principal, @Valid @RequestBody Post body) {
        return service.send(principal, body);
    }

    @PostMapping(Routes.SupportChat.READ)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@CurrentUser AuthPrincipal principal) {
        service.markRead(principal);
    }
}
