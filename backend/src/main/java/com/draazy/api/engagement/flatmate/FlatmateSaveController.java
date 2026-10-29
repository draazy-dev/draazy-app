package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FlatmateSaveController {
    private final FlatmateSaveService saveService;

    public FlatmateSaveController(FlatmateSaveService saveService) {
        this.saveService = saveService;
    }

    @GetMapping(Routes.Engagement.FLATMATE_SAVES)
    public PageResponse<Object> listSaves(@CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(
                saveService.listSaved(principal.userId(), Pageables.unsorted(pageable)), row -> row);
    }

    @GetMapping(Routes.Engagement.FLATMATE_SAVE_KEYS)
    public List<FlatmateSaveKeyDto> listKeys(@CurrentUser AuthPrincipal principal) {
        return saveService.listKeys(principal.userId());
    }

    @PutMapping(Routes.Engagement.FLATMATE_SAVE_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void save(@CurrentUser AuthPrincipal principal,
            @PathVariable String kind, @PathVariable UUID id) {
        saveService.save(principal.userId(), kind, id);
    }

    @DeleteMapping(Routes.Engagement.FLATMATE_SAVE_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsave(@CurrentUser AuthPrincipal principal,
            @PathVariable String kind, @PathVariable UUID id) {
        saveService.unsave(principal.userId(), kind, id);
    }
}
