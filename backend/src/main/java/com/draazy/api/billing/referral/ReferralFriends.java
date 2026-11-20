package com.draazy.api.billing.referral;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class ReferralFriends {
    static final String INVITED = "invited";
    static final String JOINED = "joined";
    static final String CHECKING = "checking";
    static final String LOCKED = "locked";
    static final String READY = "ready";
    static final String USED = "used";
    static final String NOT_COUNTED = "not_counted";

    private final ReferralRepository referrals;
    private final ReferralInviteRepository invites;

    ReferralFriends(ReferralRepository referrals, ReferralInviteRepository invites) {
        this.referrals = referrals;
        this.invites = invites;
    }

    List<ReferralSummaryDto.Friend> of(UUID referrerId, List<Referral> mine, int used) {
        Map<UUID, String> kycPending = kycPending(referrerId, mine);
        Map<UUID, String> states = states(mine, kycPending, used);
        List<Row> rows = new ArrayList<>();
        Set<String> joined = new HashSet<>();
        for (Referral r : mine) {
            joined.add(r.getReferredMobile());
            String state = states.get(r.getId());
            rows.add(new Row(r.getAt(), new ReferralSummaryDto.Friend(r.getReferred(), r.getReferredMobile(),
                    Objects.toString(r.getAt(), null), r.getTrack(), state,
                    LOCKED.equals(state) ? kycPending.get(r.getId()) : null)));
        }
        // Every unmatched invite reads "invited": invite() hides whether a number already has an account.
        Map<String, Instant> invitedAt = new LinkedHashMap<>();
        for (ReferralInvite i : invites.findByReferrerId(referrerId)) {
            if (!joined.contains(i.getMobile())) {
                invitedAt.merge(i.getMobile(), i.getCreatedAt(), (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        invitedAt.forEach((mobile, at) -> rows.add(new Row(at,
                new ReferralSummaryDto.Friend(null, mobile, Objects.toString(at, null), null, INVITED, null))));
        rows.sort(Comparator.comparing(Row::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return rows.stream().map(Row::friend).toList();
    }

    // Same DB-side checks as ReferralRepository.countUnlocked, so the rows always agree with rewards.locked.
    private Map<UUID, String> kycPending(UUID referrerId, List<Referral> mine) {
        List<Referral> granted = mine.stream().filter(r -> ReferralStatuses.isGranting(r.getStatus())).toList();
        if (granted.isEmpty()) {
            return Map.of();
        }
        boolean meVerified = referrals.isVerified(referrerId);
        Set<String> verifiedFriends = new HashSet<>(referrals.verifiedGrantedFriends(referrerId));
        Map<UUID, String> pending = new HashMap<>();
        for (Referral r : granted) {
            boolean friend = verifiedFriends.contains(r.getReferredMobile());
            if (!meVerified || !friend) {
                pending.put(r.getId(), !meVerified && !friend ? "both" : meVerified ? "friend" : "you");
            }
        }
        return pending;
    }

    // Credits are fungible, so spent ones go to unlocked rewards first, oldest first: that is the only
    // assignment whose per-row counts always match the earned/used/remaining/locked summary.
    private static Map<UUID, String> states(List<Referral> mine, Map<UUID, String> kycPending, int used) {
        Map<UUID, String> states = new HashMap<>();
        List<Referral> granted = new ArrayList<>();
        for (Referral r : mine) {
            if (ReferralStatuses.isGranting(r.getStatus())) {
                granted.add(r);
            } else {
                states.put(r.getId(), plainState(r.getStatus()));
            }
        }
        granted.sort(Comparator.comparing((Referral r) -> kycPending.containsKey(r.getId()))
                .thenComparing(ReferralFriends::grantedOn, Comparator.nullsLast(Comparator.naturalOrder())));
        int spent = used;
        for (Referral r : granted) {
            String state = spent > 0 ? USED : kycPending.containsKey(r.getId()) ? LOCKED : READY;
            spent = Math.max(0, spent - 1);
            states.put(r.getId(), state);
        }
        return states;
    }

    private static Instant grantedOn(Referral r) {
        return r.getGrantedAt() != null ? r.getGrantedAt() : r.getQualifiedAt();
    }

    private static String plainState(String status) {
        return switch (status) {
            case ReferralStatuses.HELD -> CHECKING;
            case ReferralStatuses.REJECTED, ReferralStatuses.CLAWED_BACK -> NOT_COUNTED;
            default -> JOINED;
        };
    }

    private record Row(Instant at, ReferralSummaryDto.Friend friend) {
    }
}
