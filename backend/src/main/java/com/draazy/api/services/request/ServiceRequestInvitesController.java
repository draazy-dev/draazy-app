package com.draazy.api.services.request;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceRequestInvitesController {
    private final CoFillParties parties;

    public ServiceRequestInvitesController(CoFillParties parties) {
        this.parties = parties;
    }

    @GetMapping(Routes.ServiceRequests.MY_INVITES)
    public List<ServiceRequestPartyDto> myInvites(@CurrentUser AuthPrincipal principal) {
        parties.claimPendingFor(principal);
        return parties.myInvites(principal);
    }

    @PostMapping(Routes.ServiceRequests.INVITE_DECISION)
    public ServiceRequestPartyDto decide(@CurrentUser AuthPrincipal principal,
            @PathVariable String partyId, @Valid @RequestBody InviteDecision body) {
        return parties.decide(principal, partyId, body.decision());
    }

    public record InviteDecision(@NotBlank String decision) {
    }
}
