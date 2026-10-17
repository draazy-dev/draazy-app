package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.erasure.AccountErased;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class FlatmateErasure {

    static final String REASON = "account erased";

    private final FlatmateMembershipService membership;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRequestRepository requests;
    private final FlatmateGroupApplicationRepository applications;

    FlatmateErasure(FlatmateMembershipService membership, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, FlatmateSeekerPostRepository posts,
            FlatmateRequestRepository requests, FlatmateGroupApplicationRepository applications) {
        this.membership = membership;
        this.rooms = rooms;
        this.groups = groups;
        this.posts = posts;
        this.requests = requests;
        this.applications = applications;
    }

    @EventListener
    void release(AccountErased event) {
        UUID userId = event.userId();
        membership.leaveAll(userId);
        rooms.findByHostIdAndArchivedFalseOrderByCreatedAtDesc(userId).forEach(r -> r.archive(REASON));
        groups.findByHostIdAndArchivedFalse(userId).forEach(g -> {
            g.archive(REASON);
            membership.disband(g);
        });
        posts.findByUserIdAndArchivedFalse(userId).ifPresent(p -> p.archive(REASON));
        requests.deletePendingInvolving(userId);
        applications.deletePendingByApplicant(userId);
    }
}
