package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.FlatmateCaseFiles.CaseView;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FlatmateCaseController {
    private final FlatmateCaseService service;

    public FlatmateCaseController(FlatmateCaseService service) {
        this.service = service;
    }

    @GetMapping(Routes.Flatmates.MY_REVIEWS)
    public List<FlatmateCaseService.MyCase> mine(@CurrentUser AuthPrincipal principal) {
        return service.mine(principal);
    }

    @GetMapping(Routes.Flatmates.CASE)
    public CaseView view(@CurrentUser AuthPrincipal principal, @PathVariable String kind,
            @PathVariable UUID id) {
        return service.view(principal, kind, id);
    }

    @PostMapping(Routes.Flatmates.CASE_MESSAGES)
    @ResponseStatus(HttpStatus.CREATED)
    public CaseView reply(@CurrentUser AuthPrincipal principal, @PathVariable String kind,
            @PathVariable UUID id, @Valid @RequestBody ReplyRequest body) {
        return service.reply(principal, kind, id, body.body());
    }

    @PostMapping(Routes.Flatmates.CASE_READ)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@CurrentUser AuthPrincipal principal, @PathVariable String kind,
            @PathVariable UUID id) {
        service.markRead(principal, kind, id);
    }

    public record ReplyRequest(@NotBlank @Size(max = 2000) String body) {
    }
}
