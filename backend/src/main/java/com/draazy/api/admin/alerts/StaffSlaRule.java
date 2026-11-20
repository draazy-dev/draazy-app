package com.draazy.api.admin.alerts;

import static java.time.Duration.ofDays;
import static java.time.Duration.ofHours;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.identity.verification.IdentityReviewClaimService;
import com.draazy.api.security.BackOfficeFunctions;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.RentAgreementSla;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

record StaffSlaRule(String name, String one, String many, Arrival arrival, Duration remind, Duration escalate,
                    String sql, Function<StaffSlaRule.Item, String> function,
                    Function<StaffSlaRule.Item, String> queueLink, Function<StaffSlaRule.Item, String> itemLink) {
    record Item(String id, String title, Instant anchor, String team, UUID assignee, Long dueSeconds) {
    }

    private static Function<Item, String> fixed(String value) {
        return item -> value;
    }

    static String deskLink(String team) {
        return switch (team == null ? "" : team) {
            case Teams.RENTAL -> "/admin/rent-agreement";
            case Teams.LOANS -> "/admin/home-loans";
            default -> "/admin/" + team;
        };
    }

    private static String rentAgreementDue() {
        String cases = RentAgreementSla.deskTargets().entrySet().stream()
                .map(e -> "when '" + e.getKey().wire() + "' then " + e.getValue().toSeconds())
                .collect(Collectors.joining(" "));
        return "case r.status " + cases + " end";
    }

    static final List<StaffSlaRule> CATALOGUE = List.of(
            new StaffSlaRule("listing-review", "listing to review", "listings to review", Arrival.UNASSIGNED,
                    ofHours(24), ofHours(36), """
                    select cast(p.id as text), p.title, coalesce(p.resubmitted_at, p.created_at), cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from properties p
                     where p.archived = false and p.status = 'pending'
                    """, fixed(BackOfficeFunctions.LISTING_MODERATION), fixed("/admin/properties"),
                    item -> "/admin/properties?review=" + item.id()),
            new StaffSlaRule("verification-reply", "owner reply to answer", "owner replies to answer", Arrival.UNASSIGNED,
                    ofHours(48), ofHours(72), """
                    select cast(p.id as text), p.title, min(m.created_at), cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from property_reviews r
                      join properties p on p.id = r.property_id
                      join review_messages m on m.review_id = r.id
                     where m.internal = false and m.read_at is null and m.sender_id = p.owner_id
                     group by p.id, p.title
                    """, fixed(BackOfficeFunctions.PROPERTY_VERIFICATION), fixed("/admin/properties"),
                    item -> "/admin/properties?review=" + item.id()),
            new StaffSlaRule("kyc-review", "ID check", "ID checks", Arrival.UNASSIGNED,
                    ofHours(48), ofHours(72), """
                    select cast(v.id as text), initcap(replace(v.doc_type, '_', ' ')) || ' check', v.submitted_at,
                           cast(null as text),
                           case when v.claimed_at > now() - interval '%d minutes' then v.claimed_by end,
                           cast(null as bigint)
                      from identity_verifications v
                     where v.status = 'pending'
                    """.formatted(IdentityReviewClaimService.CLAIM_TTL.toMinutes()), fixed(BackOfficeFunctions.KYC), fixed("/admin/kyc-review"), fixed("/admin/kyc-review")),
            new StaffSlaRule("identity-appeal", "identity appeal", "identity appeals", Arrival.UNASSIGNED,
                    ofHours(48), ofHours(72), """
                    select cast(a.id as text), 'Identity appeal', a.created_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from identity_appeals a
                     where a.status = 'open'
                    """, fixed(BackOfficeFunctions.KYC), fixed("/admin/kyc-review"), fixed("/admin/kyc-review")),
            new StaffSlaRule("desk-pickup", "unassigned service request", "unassigned service requests", Arrival.UNASSIGNED,
                    ofHours(4), ofHours(8), """
                    select cast(t.id as text), t.subject, t.created_at, t.team, cast(null as uuid), cast(null as bigint)
                      from tickets t
                     where t.assignee_id is null and t.status = 'open' and t.team is not null
                       and not exists (select 1 from service_requests s where s.ticket_id = t.id)
                    union all
                    select cast(r.id as text), coalesce(t.subject, initcap(r.type)), r.status_changed_at, r.team,
                           cast(null as uuid), cast(null as bigint)
                      from service_requests r
                      left join tickets t on t.id = r.ticket_id
                     where r.status = 'new' and r.assignee_id is null and r.type <> 'rent-agreement'
                    """, item -> BackOfficeFunctions.desk(item.team()), item -> deskLink(item.team()),
                    item -> deskLink(item.team())),
            new StaffSlaRule("rent-agreement", "rent agreement", "rent agreements", Arrival.UNASSIGNED,
                    null, null, """
                    select cast(r.id as text), coalesce(t.subject, 'Rent agreement'), r.status_changed_at, r.team,
                           r.assignee_id, cast(%s as bigint)
                      from service_requests r
                      left join tickets t on t.id = r.ticket_id
                     where r.type = 'rent-agreement'
                       and r.status in ('new', 'assigned', 'in-progress', 'changes-requested', 'approved')
                    """.formatted(rentAgreementDue()),
                    fixed(BackOfficeFunctions.desk(Teams.RENTAL)), fixed("/admin/rent-agreement"),
                    fixed("/admin/rent-agreement")),
            new StaffSlaRule("support-ticket", "support ticket", "support tickets", Arrival.UNASSIGNED,
                    ofHours(24), ofHours(48), """
                    select cast(s.id as text), s.subject,
                           coalesce((select max(m.created_at) from support_ticket_messages m
                                      where m.ticket_id = s.id and m.author_id = s.user_id), s.created_at),
                           cast(null as text), cast(null as uuid), cast(null as bigint)
                      from support_tickets s
                     where s.staff_unread and s.status not in ('resolved', 'closed')
                       and not exists (select 1 from identity_appeals a where a.ticket_id = s.id)
                    """, fixed(BackOfficeFunctions.SUPPORT), fixed("/admin/support"), fixed("/admin/support")),
            new StaffSlaRule("report", "abuse report", "abuse reports", Arrival.UNASSIGNED,
                    ofHours(24), ofHours(48), """
                    select cast(r.id as text), initcap(r.target_type) || ' report: ' || r.reason, r.created_at,
                           cast(null as text), cast(null as uuid), cast(null as bigint)
                      from reports r
                     where r.status = 'open'
                    """, fixed(BackOfficeFunctions.REPORTS), fixed("/admin/reports"), fixed("/admin/reports")),
            new StaffSlaRule("flatmate-review", "flatmate check", "flatmate checks", Arrival.UNASSIGNED,
                    ofHours(48), ofHours(72), """
                    select cast(f.id as text), 'Flatmate ' || f.kind || ' check', f.pending_since, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from flatmate_reviews f
                     where f.status = 'pending'
                    """, fixed(BackOfficeFunctions.FLATMATES), fixed("/admin/flatmates"), fixed("/admin/flatmates")),
            new StaffSlaRule("refund-review", "refund request", "refund requests", Arrival.NONE,
                    ofHours(48), ofHours(72), """
                    select cast(r.id as text), 'Refund request', r.created_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from refund_requests r
                     where r.status = 'pending_review'
                    """, fixed(BackOfficeFunctions.REFUNDS), fixed("/admin/refunds"), fixed("/admin/refunds")),
            new StaffSlaRule("erasure", "data-erasure request", "data-erasure requests", Arrival.UNASSIGNED,
                    ofDays(7), ofDays(20), """
                    select cast(e.id as text), 'Data-erasure request', e.requested_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from erasure_requests e
                     where e.status = 'pending'
                    """, fixed(null), fixed("/admin/erasure-requests"), fixed("/admin/erasure-requests")),
            // An unassigned rent agreement is already announced by the rent-agreement rule.
            new StaffSlaRule("draft-decision", "customer draft decision", "customer draft decisions", Arrival.ANY,
                    null, null, """
                    select cast(r.id as text),
                           coalesce(t.subject, initcap(replace(r.type, '-', ' ')))
                               || case r.status when 'approved' then ': draft approved'
                                                else ': changes requested' end,
                           r.status_changed_at, r.team, r.assignee_id, cast(null as bigint)
                      from service_requests r
                      left join tickets t on t.id = r.ticket_id
                     where r.status in ('changes-requested', 'approved')
                       and (r.type <> 'rent-agreement' or r.assignee_id is not null)
                    """, item -> BackOfficeFunctions.desk(item.team()), item -> deskLink(item.team()),
                    item -> deskLink(item.team())),
            new StaffSlaRule("listing-recheck", "listing re-check", "listing re-checks", Arrival.UNASSIGNED,
                    ofHours(24), ofHours(36), """
                    select cast(p.id as text), p.title, p.recheck_requested_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from properties p
                     where p.archived = false and p.recheck_requested_at is not null
                       and p.status not in ('sold', 'rented')
                       and coalesce(p.recheck_reason, '') <> '%s'
                    """.formatted(Property.OWNERSHIP_REVIEW_ITEM), fixed(BackOfficeFunctions.LISTING_MODERATION),
                    fixed("/admin/properties?tab=recheck"), item -> "/admin/properties?review=" + item.id()),
            new StaffSlaRule("badge-request", "verified-badge request", "verified-badge requests", Arrival.UNASSIGNED,
                    ofHours(48), ofHours(72), """
                    select cast(p.id as text), p.title, p.ownership_requested_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from properties p
                     where p.archived = false and p.ownership_requested_at is not null
                       and p.ownership_declined_at is null
                    """, fixed(BackOfficeFunctions.PROPERTY_VERIFICATION), fixed("/admin/properties?tab=badge"),
                    item -> "/admin/properties?review=" + item.id()),
            new StaffSlaRule("flatmate-post", "flatmate post to moderate", "flatmate posts to moderate",
                    Arrival.UNASSIGNED, ofHours(24), ofHours(48), """
                    select cast(f.id as text), f.label,
                           case when f.mod_status <> 'pending' then f.recheck_requested_at
                                when exists (select 1 from audit_log d
                                              where d.action = 'flatmate.moderate'
                                                and d.entity in ('flatmateSeekerPost', 'flatmateRoom', 'flatmateGroup')
                                                and d.entity_id = cast(f.id as text))
                                     then f.updated_at
                                else f.created_at end,
                           cast(null as text), cast(null as uuid), cast(null as bigint)
                      from (select id, 'Flatmate seeker post' as label, created_at, updated_at, mod_status,
                                   recheck_requested_at, archived from flatmate_seeker_posts
                            union all
                            select id, 'Flatmate room', created_at, updated_at, mod_status,
                                   recheck_requested_at, archived from flatmate_rooms
                            union all
                            select id, 'Flatmate group', created_at, updated_at, mod_status,
                                   recheck_requested_at, archived from flatmate_groups) f
                     where f.archived = false and (f.mod_status = 'pending' or f.recheck_requested_at is not null)
                    """, fixed(BackOfficeFunctions.FLATMATES), fixed("/admin/flatmates"), fixed("/admin/flatmates")),
            new StaffSlaRule("community-society", "community society", "community societies", Arrival.UNASSIGNED,
                    null, null, """
                    select cast(s.id as text), s.name, s.created_at, cast(null as text),
                           cast(null as uuid), cast(null as bigint)
                      from societies s
                     where s.source = 'community' and s.merged_into is null and s.archived_at is null
                    """, fixed(BackOfficeFunctions.SOCIETIES), fixed("/admin/places?tab=duplicates"),
                    fixed("/admin/places?tab=duplicates")));

    enum Arrival { NONE, UNASSIGNED, ANY }
}
