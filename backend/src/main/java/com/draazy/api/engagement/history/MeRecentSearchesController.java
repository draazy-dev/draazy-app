package com.draazy.api.engagement.history;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeRecentSearchesController {
    private final RecentSearchService service;

    public MeRecentSearchesController(RecentSearchService service) {
        this.service = service;
    }

    @GetMapping(Routes.Engagement.RECENT_SEARCHES)
    public List<RecentSearchDto> mine(@CurrentUser AuthPrincipal principal) {
        return service.list(principal.userId());
    }

    @PutMapping(Routes.Engagement.RECENT_SEARCHES)
    public List<RecentSearchDto> record(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody RecentSearchRequest body) {
        return service.record(principal.userId(), body.label(), body.url());
    }
}
