package com.draazy.api.engagement.search;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SavedSearchController {
    private final SavedSearchService service;

    public SavedSearchController(SavedSearchService service) {
        this.service = service;
    }

    @GetMapping(Routes.Engagement.SAVED_SEARCHES)
    public List<SavedSearchResponse> list(@CurrentUser AuthPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping(Routes.Engagement.SAVED_SEARCHES)
    @ResponseStatus(HttpStatus.CREATED)
    public SavedSearchResponse create(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody SavedSearchCreateRequest request) {
        return service.create(principal.userId(), request);
    }

    @PatchMapping(Routes.Engagement.SAVED_SEARCH_BY_ID)
    public SavedSearchResponse update(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @Valid @RequestBody SavedSearchUpdateRequest request) {
        return service.update(principal.userId(), id, request);
    }

    @DeleteMapping(Routes.Engagement.SAVED_SEARCH_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser AuthPrincipal principal, @PathVariable UUID id) {
        service.delete(principal.userId(), id);
    }
}
