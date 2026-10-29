package com.draazy.api.services.ticket;

import com.draazy.api.common.web.Routes;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceWaitlistController {
    private final TicketService service;

    public ServiceWaitlistController(TicketService service) {
        this.service = service;
    }

    @PostMapping(Routes.ServiceWaitlist.BASE)
    @ResponseStatus(HttpStatus.CREATED)
    public void join(@Valid @RequestBody ServiceWaitlistRequest body) {
        service.joinWaitlist(body);
    }
}
