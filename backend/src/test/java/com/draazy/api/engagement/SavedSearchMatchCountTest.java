package com.draazy.api.engagement;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.engagement.search.SavedSearch;
import com.draazy.api.engagement.search.SavedSearchCreateRequest;
import com.draazy.api.engagement.search.SavedSearchRepository;
import com.draazy.api.engagement.search.SavedSearchResponse;
import com.draazy.api.engagement.search.SavedSearchService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;

// ? a saved search reports how many listings match it, counted by the server.
// The absurd BHK fixture makes assertions exact, not "greater than existing fixtures".
@DisplayName("Saved searches — how many listings match this alert, counted server-side")
class SavedSearchMatchCountTest extends AbstractApiTest {

    private static final String SLUG = "d227-match-count";
    private static final String NAME = "D227 Match Count";

    @Autowired
    SavedSearchService savedSearches;

    @Autowired
    SavedSearchRepository searches;

    @Autowired
    UserRepository users;

    @Autowired
    PropertyRepository properties;

    @Autowired
    EntityManager em;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Owner " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private void seedLocality() {
        seedLocality(SLUG, NAME);
    }

    private void seedLocality(String slug, String name) {
        jdbc.update("""
                insert into localities (slug, name, city, active)
                values (?, ?, ?, true)
                on conflict (slug) do nothing
                """, slug, name, "Pune");
    }

    private SavedSearch alert(User user, String filters) {
        SavedSearch search = new SavedSearch(user.getId(), "rent " + SLUG);
        search.setFilters(filters);
        return searches.saveAndFlush(search);
    }

    private Property listing(User owner, String title, String deal, String bhk, String status) {
        return listing(owner, title, deal, "apartment", 31000L, bhk, status);
    }

    private Property listing(User owner, String title, String deal, String type, long price,
            String bhk, String status) {
        Property p = new Property(owner, title, deal, type, price, NAME, "Pune");
        p.setLocalitySlug(SLUG);
        p.setBhk(new BigDecimal(bhk));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    private SavedSearchResponse only(User user) {
        List<SavedSearchResponse> rows = savedSearches.list(user.getId());
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    @Test
    @DisplayName("counts every live match, however old — this is a total, not a delta")
    void countsMatchesRegardlessOfAge() {
        User user = owner("9820600001");
        seedLocality();
        alert(user,
                "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"],\"bhk\":[99]}");

        Property ancient = listing(user, "Old 99BHK", "rent", "99", "approved");
        listing(user, "New 99BHK", "rent", "99", "approved");

        // Push one of them well before any plausible sweep baseline. newCount would exclude it;
        // matchCount is the answer to a different question and must not.
        jdbc.update("update properties set created_at = ? where id = ?",
                Timestamp.from(Instant.now().minusSeconds(86_400 * 30)), ancient.getId());
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(2);
        assertThat(only(user).newCount()).isZero();
    }

    @Test
    @DisplayName("only approved, unarchived listings count")
    void ignoresListingsNobodyCanSee() {
        User user = owner("9820600002");
        seedLocality();
        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"],\"bhk\":[99]}");

        listing(user, "Live 99BHK", "rent", "99", "approved");
        listing(user, "Pending 99BHK", "rent", "99", "pending");
        listing(user, "Rejected 99BHK", "rent", "99", "rejected");
        Property archived = listing(user, "Archived 99BHK", "rent", "99", "approved");
        archived.archive("owner took it down");
        properties.saveAndFlush(archived);
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("every facet narrows: a listing must match deal, locality and BHK together")
    void everyFacetNarrows() {
        User user = owner("9820600003");
        seedLocality();
        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"],\"bhk\":[99]}");

        listing(user, "The one", "rent", "99", "approved");
        listing(user, "Wrong deal", "buy", "99", "approved");
        listing(user, "Wrong bhk", "rent", "98", "approved");

        Property elsewhere = listing(user, "Wrong locality", "rent", "99", "approved");
        seedLocality("d227-somewhere-else", "D227 Somewhere Else");
        elsewhere.setLocalitySlug("d227-somewhere-else");
        elsewhere.setLocality("Somewhere Else");
        properties.saveAndFlush(elsewhere);
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("a multi-valued facet is an OR, which is why the browser could not ask /properties")
    void multipleLocalitiesAndBhksAreUnioned() {
        User user = owner("9820600004");
        seedLocality();
        seedLocality("d227-second", "D227 Second");
        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG
                + "\",\"d227-second\"],\"bhk\":[98,99]}");

        listing(user, "Here 99", "rent", "99", "approved");
        listing(user, "Here 98", "rent", "98", "approved");
        Property second = listing(user, "There 99", "rent", "99", "approved");
        second.setLocalitySlug("d227-second");
        second.setLocality("D227 Second");
        properties.saveAndFlush(second);
        listing(user, "Here 97", "rent", "97", "approved");
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("an empty facet is no constraint, not an impossible one")
    void omittedFacetsDoNotNarrow() {
        User user = owner("9820600005");
        seedLocality();

        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"]}");

        listing(user, "99 here", "rent", "99", "approved");
        listing(user, "98 here", "rent", "98", "approved");
        listing(user, "99 to buy", "buy", "99", "approved");
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(2);
    }

    private record Home(String deal, String type, long price, String bhk, String furnishing) {
        Home(String deal, String bhk) {
            this(deal, "apartment", 31000L, bhk, null);
        }
    }

    static Stream<Arguments> narrowingFacets() {
        String in = "{\"deal\":\"%s\",\"localities\":[\"" + SLUG + "\"],%s}";
        return Stream.of(
                Arguments.of("budget range excludes out-of-range homes",
                        in.formatted("rent", "\"rent\":[0,30000]"),
                        List.of(new Home("rent", "apartment", 31000L, "99", null)), 0),
                Arguments.of("an in-range budget still counts matching homes",
                        in.formatted("rent", "\"rent\":[30000,32000]"),
                        List.of(new Home("rent", "apartment", 31000L, "99", null)), 1),
                Arguments.of("the UI's open-ended budget top is treated as unbounded",
                        in.formatted("buy", "\"budget\":[0,50000000]"),
                        List.of(new Home("buy", "apartment", 60000000L, "4", null)), 1),
                Arguments.of("open-ended BHK chips match larger homes without widening to every BHK",
                        in.formatted("buy", "\"bhk\":[\"3plus\"]"),
                        List.of(new Home("buy", "apartment", 9000000L, "4", null),
                                new Home("buy", "apartment", 9000000L, "2", null)), 1),
                Arguments.of("garbage BHK tokens are ignored without aborting the read",
                        in.formatted("rent", "\"bhk\":[\"1e999999\"]"),
                        List.of(new Home("rent", "1"), new Home("rent", "2")), 2),
                Arguments.of("property type narrows the count",
                        in.formatted("buy", "\"types\":[\"villa\"]"),
                        List.of(new Home("buy", "villa", 9000000L, "4", null),
                                new Home("buy", "apartment", 9000000L, "4", null)), 1),
                Arguments.of("furnishing narrows rent alerts",
                        in.formatted("rent", "\"furnishing\":[\"furnished\"]"),
                        List.of(new Home("rent", "apartment", 31000L, "2", "furnished"),
                                new Home("rent", "apartment", 31000L, "2", "unfurnished")), 1),
                Arguments.of("legacy postedBy saved-search criteria is ignored",
                        in.formatted("rent", "\"postedBy\":\"agent\""),
                        List.of(new Home("rent", "2")), 1));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("narrowingFacets")
    @DisplayName("saved facets narrow the live-match count")
    void facetNarrowsMatches(String label, String filters, List<Home> homes, int expected) {
        User user = owner("9820600012");
        seedLocality();
        alert(user, filters);

        for (Home home : homes) {
            Property p = listing(user, "Home", home.deal(), home.type(), home.price(), home.bhk(),
                    "approved");
            if (home.furnishing() != null) {
                p.setFurnishing(home.furnishing());
                properties.saveAndFlush(p);
            }
        }
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(expected);
    }

    @Test
    @DisplayName("facing, bathrooms and food saved facets match the public search semantics")
    void residentialFacetsMatchSearchSemantics() {
        User user = owner("9820600021");
        seedLocality();
        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG
                + "\"],\"facing\":\"east\",\"minBaths\":2,\"food\":\"nonveg\"}");

        Property match = listing(user, "East two bath", "rent", "2", "approved");
        match.setFacing("East");
        match.setBathrooms(2);
        match.setFormDetails(Map.of("food", "any"));
        properties.saveAndFlush(match);
        Property unstatedBath = listing(user, "East bath unstated", "rent", "2", "approved");
        unstatedBath.setFacing("east");
        unstatedBath.setFormDetails(Map.of("foodPref", "nonveg"));
        properties.saveAndFlush(unstatedBath);
        Property veg = listing(user, "Veg only", "rent", "2", "approved");
        veg.setFacing("east");
        veg.setBathrooms(2);
        veg.setFormDetails(Map.of("foodPref", "veg"));
        properties.saveAndFlush(veg);
        Property wrongFacing = listing(user, "West", "rent", "2", "approved");
        wrongFacing.setFacing("west");
        wrongFacing.setBathrooms(2);
        wrongFacing.setFormDetails(Map.of("food", "any"));
        properties.saveAndFlush(wrongFacing);
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("a saved Jain-only food facet counts only listings whose owner stated Jain")
    void jainFoodFacetMatchesStatedRuleOnly() {
        User user = owner("9820600029");
        seedLocality();
        alert(user, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"],\"food\":\"jain\"}");

        Property jain = listing(user, "Jain only", "rent", "2", "approved");
        jain.setFormDetails(Map.of("foodPref", "jain"));
        properties.saveAndFlush(jain);
        Property veg = listing(user, "Veg only", "rent", "2", "approved");
        veg.setFormDetails(Map.of("foodPref", "veg"));
        properties.saveAndFlush(veg);
        properties.saveAndFlush(listing(user, "Food unstated", "rent", "2", "approved"));
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("commercial shell and pre-leased saved facets read JSONB")
    void commercialJsonFacetsNarrowMatches() {
        User user = owner("9820600022");
        seedLocality();
        alert(user, "{\"deal\":\"buy\",\"localities\":[\"" + SLUG
                + "\"],\"shell\":\"bareShell\",\"preLeased\":true}");

        Property leasedBare = listing(user, "Leased bare", "buy", "commercial", 9000000L, "0", "approved");
        leasedBare.setFormDetails(Map.of("shellType", "bareShell", "tenancyStatus", "leased"));
        properties.saveAndFlush(leasedBare);
        Property vacantBare = listing(user, "Vacant bare", "buy", "commercial", 9000000L, "0", "approved");
        vacantBare.setFormDetails(Map.of("shellType", "bareShell", "tenancyStatus", "vacant"));
        properties.saveAndFlush(vacantBare);
        Property leasedWarm = listing(user, "Leased warm", "buy", "commercial", 9000000L, "0", "approved");
        leasedWarm.setFormDetails(Map.of("shellType", "warmShell", "tenancyStatus", "leased"));
        properties.saveAndFlush(leasedWarm);
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("NA and area saved facets compare against area converted to square feet")
    void landAreaFacetsNormalizeUnits() {
        User user = owner("9820600023");
        seedLocality();
        alert(user, "{\"deal\":\"buy\",\"localities\":[\"" + SLUG
                + "\"],\"na\":\"sanctioned\",\"minArea\":43000,\"maxArea\":44000}");

        Property acre = listing(user, "One acre", "buy", "farmland", 9000000L, "0", "approved");
        acre.setArea(new BigDecimal("1"));
        acre.setAreaUnit("acre");
        acre.setFormDetails(Map.of("naStatus", "sanctioned"));
        properties.saveAndFlush(acre);
        Property sqft = listing(user, "Small plot", "buy", "plot", 9000000L, "0", "approved");
        sqft.setArea(new BigDecimal("1000"));
        sqft.setAreaUnit("sqft");
        sqft.setFormDetails(Map.of("naStatus", "sanctioned"));
        properties.saveAndFlush(sqft);
        Property deemed = listing(user, "Deemed acre", "buy", "farmland", 9000000L, "0", "approved");
        deemed.setArea(new BigDecimal("1"));
        deemed.setAreaUnit("acre");
        deemed.setFormDetails(Map.of("naStatus", "deemed"));
        properties.saveAndFlush(deemed);
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("a search with no deal counts nothing rather than counting the whole catalogue")
    void noDealCountsNothing() {
        User user = owner("9820600006");
        seedLocality();
        alert(user, "{\"localities\":[\"" + SLUG + "\"],\"bhk\":[99]}");

        listing(user, "99BHK", "rent", "99", "approved");
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isZero();
    }

    @Test
    @DisplayName("a malformed filters blob answers zero, not a 500 on the user's own alert list")
    void unreadableFiltersCountZero() {
        User user = owner("9820600007");
        seedLocality();
        SavedSearch search = alert(user, "{\"deal\":\"rent\"}");

        jdbc.update("update saved_searches set filters = '[]'::jsonb where id = ?", search.getId());
        listing(user, "99BHK", "rent", "99", "approved");
        em.flush();
        em.clear();

        assertThat(only(user).matchCount()).isZero();
    }

    @Test
    @DisplayName("a flatmates alert counts the flatmate board using its own facets")
    void flatmatesAlertsAreCounted() {
        User user = owner("9820600008");
        seedLocality();
        jdbc.update("""
                insert into flatmate_seeker_posts
                    (user_id, name, gender, budget, localities, mod_status)
                values (?, 'D227 Seeker', 'female', 18000, '[\"D227 Flatmate Town\"]'::jsonb,
                    'approved')
                """, user.getId());
        em.flush();
        em.clear();

        SavedSearchResponse created = savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("Flatmate in " + NAME, "flatmates", null,
                        Map.of("deal", "rent", "localities", List.of(SLUG), "bhk", List.of(99)),
                        Map.of("tab", "team-up", "locality", "D227 Flatmate Town",
                                "budgetMin", 15000, "budget", 20000,
                                "gender", "female"),
                        null, null));

        assertThat(created.matchCount()).isEqualTo(1);
        assertThat(only(user).matchCount()).isEqualTo(1);
    }

    private void style(User user, String answers) {
        jdbc.update("insert into user_living_style (user_id, answers) values (?, ?::jsonb)", user.getId(), answers);
    }

    private void seeker(String mobile, String answers) {
        User author = owner(mobile);
        if (answers != null) {
            style(author, answers);
        }
        jdbc.update("insert into flatmate_seeker_posts (user_id, name, gender, budget, localities, mod_status)"
                + " values (?, 'Vibe Seeker', 'any', 15000, '[\"D227 Flatmate Town\"]'::jsonb, 'approved')", author.getId());
    }

    @Test
    @DisplayName("a vibe alert filters on the author's answers, with the alert owner standing in for the caller")
    void vibeNarrowsAlertsForKeysTheOwnerAnswered() {
        seedLocality();
        seeker("9820600061", "{\"food\":0,\"smoking\":0}");
        seeker("9820600062", "{\"food\":2}");
        seeker("9820600063", null);
        User answered = owner("9820600064");
        style(answered, "{\"food\":1,\"smoking\":1,\"drinks\":1}");
        User twoAnswers = owner("9820600066");
        style(twoAnswers, "{\"food\":1,\"smoking\":1}");
        em.flush();
        em.clear();

        assertThat(vibeCount(answered, List.of("food:0"))).isEqualTo(1);
        assertThat(vibeCount(answered, List.of("food:0", "food:2"))).as("OR within a key").isEqualTo(2);
        assertThat(vibeCount(answered, List.of("food:0", "smoking:1"))).as("AND across keys").isZero();
        assertThat(vibeCount(answered, List.of("food:0", "smoking:0"))).isEqualTo(1);
        assertThat(vibeCount(answered, List.of("pets:0", "bogus", "food:9"))).as("unanswered or malformed keys are ignored").isEqualTo(3);
        assertThat(vibeCount(owner("9820600065"), List.of("food:0"))).as("an owner with no answers filters nothing").isEqualTo(3);
        assertThat(vibeCount(twoAnswers, List.of("food:0"))).as("an owner below three answers filters nothing").isEqualTo(3);
    }

    private long vibeCount(User owner, List<String> vibe) {
        return savedSearches.create(owner.getId(),
                new SavedSearchCreateRequest("Vibe " + vibe + owner.getMobile(), "flatmates", null,
                        Map.of("deal", "rent", "localities", List.of(SLUG), "bhk", List.of(99)),
                        board("people", "vibe", vibe), null, null)).matchCount();
    }

    @Test
    @DisplayName("the count is the caller's own — another user's identical alert is counted for them")
    void countIsPerCallerButNotPerOwner() {
        User poster = owner("9820600009");
        User searcher = owner("9820600010");
        seedLocality();
        alert(searcher, "{\"deal\":\"rent\",\"localities\":[\"" + SLUG + "\"],\"bhk\":[99]}");

        // The catalogue is public: a searcher's count is over every live listing, not only their own.
        // That is the opposite of the own-listing duplicate check and deliberately so.
        listing(poster, "Somebody else's 99BHK", "rent", "99", "approved");
        em.flush();
        em.clear();

        assertThat(only(searcher).matchCount()).isEqualTo(1);
        assertThat(savedSearches.list(poster.getId())).isEmpty();
    }

    @Test
    @DisplayName("people counts seeker posts only, teams counts hunting groups only, move-in counts neither, and a settled group is on no tab")
    void peopleAndTeamsTabsAreCountedSeparately() {
        User user = owner("9820600031");
        seedLocality();
        jdbc.update("""
                insert into flatmate_seeker_posts (user_id, name, gender, budget, localities, mod_status)
                values (?, 'Tabs Seeker', 'any', 15000, '[\"D227 Flatmate Town\"]'::jsonb, 'approved')
                """, user.getId());
        jdbc.update("""
                insert into flatmate_groups (host_id, title, locality, localities, rent, seats_total, seats_open, mod_status,
                    hunting)
                values (?, 'Tabs Team', 'D227 Flatmate Town', '[\"D227 Flatmate Town\"]'::jsonb, 30000, 3, 1, 'approved', true),
                       (?, 'Settled Team', 'D227 Flatmate Town', '[\"D227 Flatmate Town\"]'::jsonb, 30000, 3, 1, 'approved', false)
                """, user.getId(), user.getId());
        em.flush();
        em.clear();

        for (Object[] row : new Object[][] {{"people", 1}, {"teams", 1}, {"team-up", 2}, {"move-in", 0}}) {
            SavedSearchResponse created = savedSearches.create(user.getId(),
                    new SavedSearchCreateRequest("Tab " + row[0], "flatmates", null,
                            Map.of("deal", "rent", "localities", List.of(SLUG), "bhk", List.of(99)),
                            Map.of("tab", row[0], "locality", "D227 Flatmate Town"), null, null));
            assertThat(created.matchCount()).as((String) row[0]).isEqualTo(row[1]);
        }
    }

    @Test
    @DisplayName("a team with no open seat is not a match, exactly as the board hides it")
    void fullTeamIsNotAMatch() {
        User user = owner("9820600032");
        seedLocality();
        jdbc.update("""
                insert into flatmate_groups (host_id, title, locality, localities, rent, seats_total, seats_open, mod_status,
                    hunting)
                values (?, 'Full Team', 'D227 Flatmate Town', '[\"D227 Flatmate Town\"]'::jsonb, 30000, 3, 0, 'approved', true)
                """, user.getId());
        em.flush();
        em.clear();

        assertThat(flatmateCount("9820600033", board("teams"))).isZero();
        jdbc.update("update flatmate_groups set seats_open = 1 where host_id = ?", user.getId());
        assertThat(flatmateCount("9820600034", board("teams"))).isEqualTo(1);
    }

    private long flatmateCount(String mobile, Map<String, Object> criteria) {
        User user = owner(mobile);
        return savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("Facets " + mobile, "flatmates", null,
                        Map.of("deal", "rent", "localities", List.of(SLUG), "bhk", List.of(99)),
                        criteria, null, null)).matchCount();
    }

    private static Map<String, Object> board(String tab, Object... extra) {
        Map<String, Object> criteria = new java.util.HashMap<>(Map.of("tab", tab, "locality", "D227 Flatmate Town"));
        for (int i = 0; i < extra.length; i += 2) {
            criteria.put((String) extra[i], extra[i + 1]);
        }
        return criteria;
    }

    @Test
    @DisplayName("strictGender, roomType, furnishing and gated narrow an alert exactly as they narrow the board")
    void flatmateFacetsNarrowAlerts() {
        User host = owner("9820600040");
        seedLocality();
        String place = "D227 Flatmate Town";
        jdbc.update("insert into flatmate_rooms (host_id, room_type, locality, budget, mod_status, gender,"
                + " furnishing, gated_community) values (?, 'Private room', ?, 15000, 'approved', 'any', 'furnished', true)",
                host.getId(), place);
        jdbc.update("insert into flatmate_rooms (host_id, room_type, locality, budget, mod_status, gender,"
                + " furnishing, gated_community) values (?, 'Shared room', ?, 12000, 'approved', 'female', 'semi', false)",
                host.getId(), place);
        String[] seekerMobiles = {"9820600038", "9820600039"};
        String[][] seekers = {{"any", "any"}, {"female", "private"}};
        for (int i = 0; i < seekers.length; i++) {
            String[] seeker = seekers[i];
            jdbc.update("insert into flatmate_seeker_posts (user_id, name, gender, room_pref, budget, localities,"
                    + " mod_status) values (?, 'Seeker', ?, ?, 15000, ?::jsonb, 'approved')",
                    owner(seekerMobiles[i]).getId(), seeker[0], seeker[1], "[\"" + place + "\"]");
        }
        for (String policy : new String[] {"any", "women"}) {
            jdbc.update("insert into flatmate_groups (host_id, title, locality, localities, rent, seats_total,"
                    + " seats_open, policy, mod_status, hunting) values (?, 'Team', ?, ?::jsonb, 30000, 3, 1, ?, 'approved', true)",
                    host.getId(), place, "[\"" + place + "\"]", policy);
        }
        em.flush();
        em.clear();

        assertThat(flatmateCount("9820600041", board("move-in"))).isEqualTo(2);
        assertThat(flatmateCount("9820600042", board("move-in", "gender", "female"))).isEqualTo(2);
        assertThat(flatmateCount("9820600043", board("move-in", "gender", "female", "strictGender", true))).isEqualTo(1);
        assertThat(flatmateCount("9820600044", board("move-in", "gender", "female", "strictGender", "yes"))).isEqualTo(2);
        assertThat(flatmateCount("9820600045", board("move-in", "gated", true))).isEqualTo(1);
        assertThat(flatmateCount("9820600046", board("move-in", "gated", "maybe"))).isEqualTo(2);
        assertThat(flatmateCount("9820600047", board("move-in", "furnishing", "semi"))).isEqualTo(1);
        assertThat(flatmateCount("9820600048", board("move-in", "furnishing", "luxury"))).isEqualTo(2);
        assertThat(flatmateCount("9820600049", board("move-in", "roomType", "shared"))).isEqualTo(1);

        assertThat(flatmateCount("9820600050", board("people", "gender", "female"))).isEqualTo(2);
        assertThat(flatmateCount("9820600051", board("people", "gender", "female", "strictGender", true))).isEqualTo(1);
        assertThat(flatmateCount("9820600052", board("people", "roomType", "shared"))).isEqualTo(1);
        assertThat(flatmateCount("9820600053", board("people", "roomType", "private"))).isEqualTo(2);

        assertThat(flatmateCount("9820600054", board("teams", "gender", "female"))).isEqualTo(2);
        assertThat(flatmateCount("9820600055", board("teams", "gender", "female", "strictGender", true))).isEqualTo(1);
        assertThat(flatmateCount("9820600056", board("teams", "roomType", "private", "gated", true))).isEqualTo(2);
    }

    @Test
    @DisplayName("the created row already carries its count, so the card never renders a stale zero")
    void createReturnsTheCount() {
        User user = owner("9820600011");
        seedLocality();
        listing(user, "99BHK", "rent", "99", "approved");
        em.flush();
        em.clear();

        SavedSearchResponse created = savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("D227 alert", "listings", "rent " + SLUG,
                        Map.of("deal", "rent", "localities", List.of(SLUG), "bhk", List.of(99)),
                        null, null, null));

        // The alert card renders the count the moment it is saved. Serving 0 here and the real
        // number on the next list read would look like the alert found nothing.
        assertThat(created.matchCount()).isEqualTo(1);
        assertThat(created.newCount()).isZero();
    }

    @Test
    @DisplayName("creating identical criteria returns the existing saved search")
    void duplicateCriteriaReturnsExistingSearch() {
        User user = owner("9820600020");
        seedLocality();
        Map<String, Object> filters = Map.of("deal", "rent", "localities", List.of(SLUG),
                "bhk", List.of(98, 99));
        Map<String, Object> sameFilters = Map.of("bhk", List.of(99, 98),
                "localities", List.of(SLUG), "deal", "rent");

        SavedSearchResponse first = savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("First", "listings", "rent " + SLUG,
                        filters, null, null, null));
        SavedSearchResponse second = savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("Second", "listings", "rent " + SLUG,
                        sameFilters, null, null, null));

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(savedSearches.list(user.getId())).hasSize(1);
    }
}
