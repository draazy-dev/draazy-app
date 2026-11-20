package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.FlatmateCaseFiles;
import com.draazy.api.common.trust.FlatmateCaseFiles.CaseSummary;
import com.draazy.api.common.trust.FlatmateCaseFiles.CaseView;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateCaseService {
    private final FlatmateCaseFiles caseFiles;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateSeekerPostRepository posts;
    private final AuditService audit;

    public FlatmateCaseService(FlatmateCaseFiles caseFiles, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, FlatmateSeekerPostRepository posts, AuditService audit) {
        this.caseFiles = caseFiles;
        this.rooms = rooms;
        this.groups = groups;
        this.posts = posts;
        this.audit = audit;
    }

    public record MyCase(String kind, UUID id, String status, String reasonCode, String reasonNote,
            int unread, Instant updatedAt, String lastMessage) {
    }

    @Transactional(readOnly = true)
    public CaseView view(AuthPrincipal caller, String kind, UUID id) {
        return caseFiles.view(kind(kind), id, ownedHost(caller, kind, id));
    }

    @Transactional
    public CaseView reply(AuthPrincipal caller, String kind, UUID id, String body) {
        UUID host = ownedHost(caller, kind, id);
        caseFiles.reply(kind(kind), id, host, body);
        return caseFiles.view(kind(kind), id, host);
    }

    @Transactional
    public void markRead(AuthPrincipal caller, String kind, UUID id) {
        caseFiles.markRead(kind(kind), id, ownedHost(caller, kind, id));
    }

    @Transactional(readOnly = true)
    public List<MyCase> mine(AuthPrincipal caller) {
        UUID me = caller.userId();
        Map<UUID, String> kinds = new LinkedHashMap<>();
        rooms.findByHostIdAndArchivedFalseOrderByCreatedAtDesc(me)
                .forEach(room -> kinds.put(room.getId(), FlatmateCaseFiles.KIND_ROOM));
        groups.findByHostIdAndArchivedFalse(me)
                .forEach(group -> kinds.put(group.getId(), FlatmateCaseFiles.KIND_GROUP));
        posts.findByUserIdAndArchivedFalse(me)
                .ifPresent(post -> kinds.put(post.getId(), FlatmateCaseFiles.KIND_POST));
        Map<UUID, UUID> hosts = new LinkedHashMap<>();
        kinds.keySet().forEach(id -> hosts.put(id, me));
        List<MyCase> out = new ArrayList<>();
        caseFiles.summaries(hosts).forEach((id, summary) -> out.add(of(kinds.get(id), id, summary)));
        return out;
    }

    @Transactional
    public void tick(AuthPrincipal caller, UUID id, String item, boolean pass) {
        Target target = target(id);
        FlatmateModerationService.requireNotParty(caller, target.parties());
        caseFiles.tick(target.kind(), id, caller.userId(), item, pass);
        audit.record(caller, "flatmate.checklist", "flatmate", id.toString(),
                "item", item, "pass", String.valueOf(pass));
    }

    private static MyCase of(String kind, UUID id, CaseSummary summary) {
        return new MyCase(kind, id, summary.status(), summary.reasonCode(), summary.reasonNote(),
                summary.unreadForHost(), summary.updatedAt(), summary.lastMessage());
    }

    private static String kind(String kind) {
        return switch (kind) {
            case FlatmateCaseFiles.KIND_POST, FlatmateCaseFiles.KIND_ROOM, FlatmateCaseFiles.KIND_GROUP -> kind;
            default -> throw NotFoundException.of("Flatmate post");
        };
    }

    private UUID ownedHost(AuthPrincipal caller, String kind, UUID id) {
        UUID host = switch (kind(kind)) {
            case FlatmateCaseFiles.KIND_ROOM -> rooms.findById(id)
                    .filter(room -> !room.isArchived()).map(FlatmateRoom::getHostId).orElse(null);
            case FlatmateCaseFiles.KIND_GROUP -> groups.findById(id)
                    .filter(group -> !group.isArchived()).map(FlatmateGroup::getHostId).orElse(null);
            default -> posts.findById(id)
                    .filter(post -> !post.isArchived()).map(FlatmateSeekerPost::getUserId).orElse(null);
        };
        if (host == null || !host.equals(caller.userId())) {
            throw NotFoundException.of("Flatmate post");
        }
        return host;
    }

    private Target target(UUID id) {
        return posts.findById(id).map(p -> new Target(FlatmateCaseFiles.KIND_POST, new UUID[] {p.getUserId()}))
                .or(() -> rooms.findById(id)
                        .map(r -> new Target(FlatmateCaseFiles.KIND_ROOM, new UUID[] {r.getHostId()})))
                .or(() -> groups.findById(id).map(g -> new Target(FlatmateCaseFiles.KIND_GROUP, g.parties())))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
    }

    private record Target(String kind, UUID[] parties) {
    }
}
