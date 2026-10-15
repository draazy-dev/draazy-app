package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.erasure.AccountErased;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class FlatmateErasure {

    private final FlatmateMembershipService membership;

    FlatmateErasure(FlatmateMembershipService membership) {
        this.membership = membership;
    }

    @EventListener
    void release(AccountErased event) {
        membership.leaveAll(event.userId());
    }
}
