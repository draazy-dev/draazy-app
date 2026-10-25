package com.draazy.api.engagement.flatmate;

import com.draazy.api.engagement.livingstyle.LivingStyleService;
import com.draazy.api.engagement.livingstyle.LivingStyleViewer;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Keyed on seeker intent; the database sorts, counts and pages instead of an in-memory merge.
 * See docs/flows/consumer/flatmates.md §5. */
@Service
public class FlatmateFeedService {

    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateSearchQueries search;
    private final FlatmateMapper mapper;
    private final UserRepository users;
    /** The room card's own joins — host name and flat ledger — batched across the window. */
    private final FlatmateRoomCards cards;
    /** The Ops verdict behind a group's tier badge, batched across the window. */
    private final FlatmateReviewStatuses reviewStatuses;
    private final LivingStyleService livingStyle;
    private final FlatmateFeedMatches feedMatches;

    public FlatmateFeedService(FlatmateSeekerPostRepository posts, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, FlatmateSearchQueries search, FlatmateMapper mapper,
            UserRepository users, FlatmateRoomCards cards, FlatmateReviewStatuses reviewStatuses,
            LivingStyleService livingStyle, FlatmateFeedMatches feedMatches) {
        this.posts = posts;
        this.rooms = rooms;
        this.groups = groups;
        this.search = search;
        this.mapper = mapper;
        this.users = users;
        this.cards = cards;
        this.reviewStatuses = reviewStatuses;
        this.livingStyle = livingStyle;
        this.feedMatches = feedMatches;
    }

    /** {@code verifiedTotal} spans every match: once the server pages, the browser cannot see enough rows.
     * {@code tabTotals} counts every tab under the same facets, so the tab strip never needs a second request. */
    public record FeedResult(Page<Object> page, long verifiedTotal, long otherTabTotal,
            Map<String, Long> tabTotals, Map<String, Integer> matches) {
    }

    /** {@code GET /flatmates/feed} — public; {@code viewerId} is null for a guest. One feed per tab. */
    @Transactional(readOnly = true)
    public FeedResult feed(UUID viewerId, FlatmateSearchQuery requested, Pageable pageable) {
        LivingStyleViewer viewer = livingStyle.viewer(viewerId);
        FlatmateSearchQuery facets = requested.withStyle(viewer);
        FlatmateSearchQueries.Result result = search.search(facets, pageable);
        List<Object> window = load(result.refs());
        Map<String, Long> tabTotals = tabTotals(facets, result.total());
        long otherTab = facets.movingIn()
                ? tabTotals.get(FlatmateVocabulary.TAB_PEOPLE) + tabTotals.get(FlatmateVocabulary.TAB_TEAMS)
                : tabTotals.get(FlatmateVocabulary.TAB_MOVE_IN);
        return new FeedResult(
                new PageImpl<>(render(window), pageable, result.total()), result.verifiedTotal(),
                otherTab, tabTotals, feedMatches.forWindow(viewer, window));
    }

    /** The current tab reuses the page's own total; the rest cost two counts, because {@code team-up}
     * is exactly people plus teams. */
    private Map<String, Long> tabTotals(FlatmateSearchQuery facets, long current) {
        Map<String, Long> totals = new HashMap<>();
        switch (facets.tab()) {
            case FlatmateVocabulary.TAB_MOVE_IN -> {
                totals.put(FlatmateVocabulary.TAB_MOVE_IN, current);
                totals.put(FlatmateVocabulary.TAB_PEOPLE, countOf(facets, FlatmateVocabulary.TAB_PEOPLE));
                totals.put(FlatmateVocabulary.TAB_TEAMS, countOf(facets, FlatmateVocabulary.TAB_TEAMS));
            }
            case FlatmateVocabulary.TAB_PEOPLE -> {
                totals.put(FlatmateVocabulary.TAB_PEOPLE, current);
                totals.put(FlatmateVocabulary.TAB_MOVE_IN, countOf(facets, FlatmateVocabulary.TAB_MOVE_IN));
                totals.put(FlatmateVocabulary.TAB_TEAMS, countOf(facets, FlatmateVocabulary.TAB_TEAMS));
            }
            case FlatmateVocabulary.TAB_TEAMS -> {
                totals.put(FlatmateVocabulary.TAB_TEAMS, current);
                totals.put(FlatmateVocabulary.TAB_MOVE_IN, countOf(facets, FlatmateVocabulary.TAB_MOVE_IN));
                totals.put(FlatmateVocabulary.TAB_PEOPLE, countOf(facets, FlatmateVocabulary.TAB_PEOPLE));
            }
            default -> {
                long people = countOf(facets, FlatmateVocabulary.TAB_PEOPLE);
                totals.put(FlatmateVocabulary.TAB_MOVE_IN, countOf(facets, FlatmateVocabulary.TAB_MOVE_IN));
                totals.put(FlatmateVocabulary.TAB_PEOPLE, people);
                totals.put(FlatmateVocabulary.TAB_TEAMS, current - people);
            }
        }
        return totals;
    }

    private long countOf(FlatmateSearchQuery facets, String tab) {
        return search.total(facets.withTab(tab));
    }

    /** Sort is re-imposed from the refs because {@code findAllById} makes no promise about order. */
    private List<Object> load(List<FlatmateSearchQueries.Ref> refs) {
        Map<UUID, FlatmateRoom> roomsById = index(rooms.findAllById(idsOf(refs, "room")),
                FlatmateRoom::getId);
        Map<UUID, FlatmateGroup> groupsById = index(groups.findAllById(idsOf(refs, "group")),
                FlatmateGroup::getId);
        Map<UUID, FlatmateSeekerPost> postsById = index(posts.findAllById(idsOf(refs, "post")),
                FlatmateSeekerPost::getId);

        return refs.stream()
                .map(ref -> (Object) switch (ref.kind()) {
                    case "room" -> roomsById.get(ref.id());
                    case "group" -> groupsById.get(ref.id());
                    default -> postsById.get(ref.id());
                })
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private static List<UUID> idsOf(List<FlatmateSearchQueries.Ref> refs, String kind) {
        return refs.stream()
                .filter(ref -> kind.equals(ref.kind()))
                .map(FlatmateSearchQueries.Ref::id)
                .toList();
    }

    private static <T> Map<UUID, T> index(List<T> rows, java.util.function.Function<T, UUID> key) {
        return rows.stream().collect(Collectors.toMap(key, row -> row));
    }

    /** Host names and room-card joins are batched per window; hardcoding occupancy would misprice a full flat. */
    private List<Object> render(List<Object> window) {
        List<UUID> hostIds = window.stream()
                .map(FlatmateFeedMatches::authorOf)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, String> names = users.findAllById(hostIds).stream()
                .filter(user -> user.getName() != null)
                .collect(Collectors.toMap(User::getId, User::getName));
        Map<UUID, FlatmateMapper.RoomView> roomViews = cards.anonymousViews(
                window.stream()
                        .filter(FlatmateRoom.class::isInstance)
                        .map(FlatmateRoom.class::cast)
                        .toList(),
                names);
        Map<UUID, String> groupVerdicts = reviewStatuses.forGroups(window.stream()
                .filter(FlatmateGroup.class::isInstance)
                .map(FlatmateGroup.class::cast)
                .toList());

        return window.stream().map(source -> switch (source) {
            case FlatmateRoom r -> (Object) mapper.toFeedDto(r, roomViews.get(r.getId()));
            case FlatmateGroup g -> (Object) mapper.toFeedDto(g,
                    FlatmateMapper.PartyView.anonymous(
                            names.get(g.getHostId()), groupVerdicts.get(g.getId())));
            case FlatmateSeekerPost p -> (Object) mapper.toFeedDto(p);
            default -> throw new IllegalStateException("Unmappable feed entry: " + source.getClass());
        }).toList();
    }
}
