package com.draazy.api.leads.photos;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PhotoRequestController {
    private final PhotoRequestService photoRequests;

    public PhotoRequestController(PhotoRequestService photoRequests) {
        this.photoRequests = photoRequests;
    }

    @PostMapping(Routes.PropertyPhotoRequests.BASE)
    public PhotoRequestCreateResponse request(
            @CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return photoRequests.request(principal.userId(), id);
    }
}
