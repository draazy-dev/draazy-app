package com.draazy.api.catalog.owner;

import com.draazy.api.common.web.Routes;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OwnerProfileController {
    private final OwnerProfileService owners;

    public OwnerProfileController(OwnerProfileService owners) {
        this.owners = owners;
    }

    @GetMapping(Routes.Owners.BY_ID)
    public OwnerProfileResponse byId(@PathVariable String id) {
        return owners.byId(id);
    }
}
