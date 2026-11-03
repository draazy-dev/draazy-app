-- A team that already has a flat lists its spare seats as a room; the API now refuses such a team.
-- Members, reviews, conversations and consents stay on the archived group.
DO $$
DECLARE
    g          flatmate_groups%ROWTYPE;
    new_room   uuid;
    open_seats integer;
    places     integer;
BEGIN
    FOR g IN
        SELECT * FROM flatmate_groups
         WHERE NOT archived AND NOT hunting AND host_role = 'tenant'
         ORDER BY created_at
           FOR UPDATE
    LOOP
        open_seats := GREATEST(0, LEAST(
            GREATEST(0, g.seats_total - (SELECT count(*) FROM flatmate_group_members m WHERE m.group_id = g.id)),
            COALESCE(g.seats_open, g.seats_total)));
        -- A room offers one seat, or two when shared (applyRoomPlaces), however many the team had open.
        places := LEAST(2, GREATEST(1, open_seats));
        new_room := gen_random_uuid();

        -- A room is never public without photos, so a live team goes back through moderation until it has them.
        INSERT INTO flatmate_rooms (
            id, host_id, title, room_type, price_basis, budget, deposit,
            seats_total, seats_open, notice_period_days, lock_in_months,
            maintenance_billing, electricity_billing, host_role, verification_tier, agreement_declared,
            owner_consent, owner_consent_mobile, address_fingerprint, flag_for_review, mod_status,
            locality, localities, lat, lng, gender, note,
            recheck_requested_at, recheck_reason, active_until, expiry_reminded, expired_from,
            created_at, updated_at)
        VALUES (
            new_room, g.host_id, g.title,
            CASE WHEN places = 2 THEN 'Shared room' ELSE 'Private room' END,
            'room', g.per_head * places, g.deposit,
            places, LEAST(open_seats, places), g.notice_period_days, g.lock_in_months,
            g.maintenance_billing, g.electricity_billing, g.host_role, g.verification_tier, g.agreement_declared,
            g.owner_consent, g.owner_consent_mobile, g.address_fingerprint, g.flag_for_review,
            CASE WHEN g.mod_status IN ('live', 'approved') THEN 'pending' ELSE g.mod_status END,
            g.locality, jsonb_build_array(g.locality), g.lat, g.lng,
            CASE g.policy WHEN 'women' THEN 'female' WHEN 'men' THEN 'male' ELSE 'any' END,
            g.note,
            CASE WHEN g.mod_status IN ('live', 'approved') THEN NULL ELSE g.recheck_requested_at END,
            CASE WHEN g.mod_status IN ('live', 'approved') THEN NULL ELSE g.recheck_reason END,
            g.active_until, g.expiry_reminded, g.expired_from,
            g.created_at, now());

        INSERT INTO flatmate_reviews (
            kind, room_id, host_id, address, tier, flag_for_review, owner_consent, agreement_doc, status, reason,
            decided_by, agreement_valid_till, tenancy_property_id, evidence_type, evidence_issued_on,
            name_matches, address_matches, created_at, updated_at)
        SELECT 'room', new_room, r.host_id, r.address, r.tier, r.flag_for_review, r.owner_consent, r.agreement_doc,
               r.status, r.reason, r.decided_by, r.agreement_valid_till, r.tenancy_property_id, r.evidence_type,
               r.evidence_issued_on, r.name_matches, r.address_matches, r.created_at, now()
          FROM flatmate_reviews r
         WHERE r.group_id = g.id AND r.status <> 'pending';

        UPDATE flatmate_reviews
           SET kind = 'room', room_id = new_room, group_id = NULL, updated_at = now()
         WHERE group_id = g.id AND status = 'pending';

        UPDATE flatmate_requests
           SET status = 'declined', decided_at = now(), updated_at = now()
         WHERE kind = 'group' AND target_id = g.id AND status = 'pending';

        UPDATE flatmate_group_applications
           SET status = 'declined', decided_at = now(), updated_at = now()
         WHERE group_id = g.id AND status = 'pending';

        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (g.host_id, 'flatmate.group.moved', g.title || ' is now a room listing',
                'A team that already has a flat lists its spare seats as a room. Add photos to publish it.',
                '/flatmates/room/' || new_room);

        UPDATE flatmate_groups
           SET archived = true, archived_at = now(), archive_reason = 'moved to a room', updated_at = now()
         WHERE id = g.id;
    END LOOP;
END $$;
