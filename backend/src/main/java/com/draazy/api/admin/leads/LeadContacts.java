package com.draazy.api.admin.leads;

import static com.draazy.api.admin.leads.LeadRecords.at;

import com.draazy.api.admin.leads.LeadRecords.Row;
import com.draazy.api.admin.leads.LeadRequests.Contact;
import com.draazy.api.admin.leads.LeadRequests.Profile;
import com.draazy.api.admin.leads.LeadRequests.StageChange;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadContacts {
    private static final int MAX_NOTE = 2000;

    private static final String APPLY_CONTACT = """
            update crm_leads set last_contact_at = now(), last_activity_at = now(), next_follow_up_at = ?,
                   failed_attempts = ?, stage = ? where id = ?
            """;

    private static final String APPLY_STAGE = """
            update crm_leads set stage = ?, next_follow_up_at = ?, failed_attempts = ?, last_activity_at = now()
             where id = ?
            """;

    private static final String SET_INTERESTS = """
            update crm_leads set interests = cast(? as text[]), last_activity_at = now() where id = ?
            """;

    private static final String SET_PROFILE = """
            update crm_leads set name = coalesce(?, name), lead_type = ?, intent = ?,
                   property_types = cast(? as text[]), bhk = cast(? as text[]), localities = ?, budget = ?,
                   lead_source = ?, source_detail = ?
             where id = ?
            """;

    private static final String BUMP = "update crm_leads set last_activity_at = now() where id = ?";

    private final JdbcTemplate jdbc;
    private final LeadRecords records;

    LeadContacts(JdbcTemplate jdbc, LeadRecords records) {
        this.jdbc = jdbc;
        this.records = records;
    }

    @Transactional
    public void contact(AuthPrincipal caller, UUID id, Contact request) {
        Row row = records.owned(id, caller.userId());
        requireOpen(row);
        String channel = LeadVocabulary.required(LeadVocabulary.CHANNELS, request.channel(), "channel");
        String outcome = LeadVocabulary.required(LeadVocabulary.OUTCOMES, request.outcome(), "outcome");
        Instant now = Instant.now();
        if (coolingDown(row, now)) {
            Instant after = row.lastContactAt().plus(LeadQueries.COOLDOWN);
            throw new ConflictException("lead-cooldown", "Already contacted in the last 24 hours — try again after "
                    + after);
        }
        int failed = LeadVocabulary.FAILED_OUTCOMES.contains(outcome) ? row.failedAttempts() + 1
                : LeadVocabulary.CONNECTED_OUTCOMES.contains(outcome) ? 0 : row.failedAttempts();
        String stage = nextStage(row.stage(), outcome, failed);
        Instant followUp = LeadVocabulary.isOpen(stage) ? request.nextFollowUpAt() : null;
        jdbc.update(APPLY_CONTACT, at(followUp), failed, stage, id);
        records.activity(id, caller.userId(), channel, outcome, clean(request.note()));
        if (!stage.equals(row.stage())) {
            records.activity(id, caller.userId(), "stage", null, row.stage() + " → " + stage + " (automatic)");
        }
    }

    @Transactional
    public void stage(AuthPrincipal caller, UUID id, StageChange request) {
        Row row = records.owned(id, caller.userId());
        if (LeadVocabulary.DO_NOT_CALL.equals(row.stage()) || LeadVocabulary.CONVERTED.equals(row.stage())) {
            throw new ConflictException("lead-closed", "This lead is closed and cannot change stage");
        }
        String stage = LeadVocabulary.required(LeadVocabulary.STAGES, request.stage(), "stage");
        if (LeadVocabulary.CONVERTED.equals(stage)) {
            throw new BadRequestException("Convert a lead by linking a paid request, not by changing its stage");
        }
        String note = clean(request.note());
        if (note == null) {
            throw new BadRequestException("A note is required when changing stage");
        }
        boolean needsFollowUp = LeadVocabulary.CONTACTED.equals(stage) || LeadVocabulary.INTERESTED.equals(stage);
        if (needsFollowUp && (request.nextFollowUpAt() == null || !request.nextFollowUpAt().isAfter(Instant.now()))) {
            throw new BadRequestException("Set a follow-up time in the future");
        }
        Instant followUp = LeadVocabulary.isOpen(stage) ? request.nextFollowUpAt() : null;
        int failed = LeadVocabulary.isOpen(stage) ? 0 : row.failedAttempts();
        jdbc.update(APPLY_STAGE, stage, at(followUp), failed, id);
        records.activity(id, caller.userId(), "stage", stage, note);
    }

    @Transactional
    public void interests(AuthPrincipal caller, UUID id, List<String> requested) {
        records.lock(id);
        List<String> clean = LeadVocabulary.services(requested);
        jdbc.update(SET_INTERESTS, clean.toArray(String[]::new), id);
    }

    @Transactional
    public void profile(AuthPrincipal caller, UUID id, Profile request) {
        records.lock(id);
        LeadProfile p = LeadProfile.of(request);
        jdbc.update(SET_PROFILE, LeadProfile.name(request), p.leadType(), p.intent(),
                p.propertyTypes().toArray(String[]::new), p.bhk().toArray(String[]::new), p.localities(), p.budget(),
                p.leadSource(), p.sourceDetail(), id);
        records.activity(id, caller.userId(), "profile", null, "Profile updated");
    }

    @Transactional
    public void note(AuthPrincipal caller, UUID id, String body) {
        records.lock(id);
        String note = clean(body);
        if (note == null) {
            throw new BadRequestException("Note cannot be empty");
        }
        records.activity(id, caller.userId(), "note", null, note);
        jdbc.update(BUMP, id);
    }

    private static void requireOpen(Row row) {
        if (!LeadVocabulary.isOpen(row.stage())) {
            throw new ConflictException("lead-closed", "This lead is closed — change its stage to reopen it");
        }
    }

    private static boolean coolingDown(Row row, Instant now) {
        if (row.lastContactAt() == null || !row.lastContactAt().isAfter(now.minus(LeadQueries.COOLDOWN))) {
            return false;
        }
        boolean followUpDue = row.nextFollowUpAt() != null && !row.nextFollowUpAt().isAfter(now);
        return !followUpDue;
    }

    private static String nextStage(String stage, String outcome, int failed) {
        if (LeadVocabulary.WRONG_NUMBER.equals(outcome)) {
            return LeadVocabulary.LOST;
        }
        if (failed >= LeadVocabulary.MAX_FAILED_ATTEMPTS) {
            return LeadVocabulary.NOT_REACHABLE;
        }
        if (LeadVocabulary.NEW.equals(stage) && LeadVocabulary.CONNECTED_OUTCOMES.contains(outcome)) {
            return LeadVocabulary.CONTACTED;
        }
        return stage;
    }

    private static String clean(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.strip();
        return trimmed.length() > MAX_NOTE ? trimmed.substring(0, MAX_NOTE) : trimmed;
    }
}
