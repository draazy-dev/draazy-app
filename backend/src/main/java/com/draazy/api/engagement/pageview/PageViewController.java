package com.draazy.api.engagement.pageview;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PageViewController {
    private final PageViewService service;

    public PageViewController(PageViewService service) {
        this.service = service;
    }

    @PostMapping(Routes.PageViews.BASE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void record(@Valid @RequestBody PageViewBatchCreate body,
                       @CurrentUser AuthPrincipal principal) {
        service.record(body, principal);
    }
}
