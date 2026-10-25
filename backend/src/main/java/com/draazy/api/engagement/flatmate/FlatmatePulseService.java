package com.draazy.api.engagement.flatmate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads the homepage flatmate panel off the same public rows the board's "team-up" tab lists. */
@Service
public class FlatmatePulseService {

    private static final FlatmateSearchQuery NEWEST_SEEKERS = new FlatmateSearchQuery(
            FlatmateVocabulary.TAB_TEAM_UP, null, null, null, null, null, null, null, null,
            false, null, Map.of(), null, null, FlatmateSearchQuery.SORT_NEWEST, List.of(), null, null);

    private final FlatmateSearchQueries search;
    private final FlatmateSeekerPostRepository posts;
    private final FlatmateGroupRepository groups;

    public FlatmatePulseService(FlatmateSearchQueries search, FlatmateSeekerPostRepository posts,
            FlatmateGroupRepository groups) {
        this.search = search;
        this.posts = posts;
        this.groups = groups;
    }

    @Transactional(readOnly = true)
    public FlatmatePulse pulse() {
        FlatmateSearchQueries.Result seekers = search.search(NEWEST_SEEKERS, PageRequest.of(0, FlatmatePulse.FACES));
        return new FlatmatePulse(seekers.total(), faces(seekers.refs()), search.newestSplit());
    }

    /** A group shows the face its card leads with: its first member who has initials. */
    private List<String> faces(List<FlatmateSearchQueries.Ref> refs) {
        Map<UUID, String> faces = new HashMap<>();
        posts.findAllById(idsOf(refs, "post"))
                .forEach(p -> faces.put(p.getId(), FlatmateGroupMember.initialsOf(p.getName())));
        groups.findAllById(idsOf(refs, "group")).forEach(g -> faces.put(g.getId(), g.getMembers().stream()
                .map(FlatmateGroupMember::getInitials).filter(Objects::nonNull).findFirst().orElse(null)));
        return refs.stream().map(r -> faces.get(r.id())).filter(Objects::nonNull).toList();
    }

    private static List<UUID> idsOf(List<FlatmateSearchQueries.Ref> refs, String kind) {
        return refs.stream().filter(r -> kind.equals(r.kind())).map(FlatmateSearchQueries.Ref::id).toList();
    }
}
