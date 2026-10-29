package com.draazy.api.catalog.city;

import com.draazy.api.common.web.Routes;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CityController {
    private final CityService cityService;

    public CityController(CityService cityService) {
        this.cityService = cityService;
    }

    @PostMapping(Routes.Cities.WAITLIST)
    @ResponseStatus(HttpStatus.CREATED)
    public void joinWaitlist(@Valid @RequestBody CityWaitlistCreateRequest request) {
        cityService.joinWaitlist(request);
    }
}
