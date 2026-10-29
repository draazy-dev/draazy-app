package com.draazy.api.catalog.photo;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MePhotosController {
    private final PhotoService photoService;

    public MePhotosController(PhotoService photoService) {
        this.photoService = photoService;
    }

    @PostMapping(value = Routes.MePhotos.BASE, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PhotoDto uploadPhoto(@CurrentUser AuthPrincipal principal,
            @RequestParam("file") MultipartFile file) {
        return photoService.upload(principal.userId(), file);
    }
}
