package com.draazy.api.leads.contact;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ContactController {
    private final ContactService contactService;

    public ContactController(ContactService contactService) {
        this.contactService = contactService;
    }

    @GetMapping(Routes.Contacts.STATUS)
    public ContactStatusResponse status(@CurrentUser AuthPrincipal principal,
            @RequestParam String propertyId) {
        return contactService.status(principal.userId(), propertyId);
    }

    @PostMapping(Routes.Contacts.REQUEST)
    public ContactStatusResponse request(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody ContactRequestCreate body) {
        return contactService.request(principal.userId(), body);
    }
}
