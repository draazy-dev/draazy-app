package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadIngest.Incoming;
import com.draazy.api.admin.leads.LeadIngest.Landed;
import com.draazy.api.admin.leads.LeadRecords.Row;
import com.draazy.api.admin.leads.LeadRequests.NewLead;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadWorkflow {
    private static final String CLAIM = """
            update crm_leads set owner_id = ?, claimed_at = now(), last_activity_at = now()
             where id = ? and owner_id is null and stage <> 'do-not-call'
               and (select count(*) from crm_leads o
                     where o.owner_id = ? and o.stage in ('new', 'contacted', 'interested')) < 50
            """;

    private static final String OWNER_NAME = """
            select coalesce(u.name, 'a colleague') from users u where u.id = ?
            """;

    private static final String RELEASE = """
            update crm_leads set owner_id = null, claimed_at = null, next_follow_up_at = null where id = ?
            """;

    private static final String ASSIGN = """
            update crm_leads set owner_id = ?, claimed_at = now(), last_activity_at = now() where id = ?
            """;

    private static final String BACK_OFFICE_TARGET = """
            select coalesce(name, 'Staff') from users
             where id = ? and role in ('staff', 'manager', 'admin') and not archived
            """;

    private static final String VIEWED = """
            insert into crm_lead_activities (lead_id, actor_id, kind)
            select ?, ?, 'reveal'
             where not exists (select 1 from crm_lead_activities
                                where lead_id = ? and actor_id = ? and kind = 'reveal'
                                  and created_at > now() - interval '1 day')
            """;

    private final JdbcTemplate jdbc;
    private final LeadRecords records;
    private final LeadQueries queries;
    private final LeadIngest ingest;
    private final AuditService audit;
    private final RateLimitLock locks;

    LeadWorkflow(JdbcTemplate jdbc, LeadRecords records, LeadQueries queries, LeadIngest ingest,
            AuditService audit, RateLimitLock locks) {
        this.jdbc = jdbc;
        this.records = records;
        this.queries = queries;
        this.ingest = ingest;
        this.audit = audit;
        this.locks = locks;
    }

    @Transactional
    public void claim(AuthPrincipal caller, UUID id) {
        locks.holdUntilCommit(RateLimitLock.Limit.LEAD_CLAIM, caller.userId().toString());
        if (jdbc.update(CLAIM, caller.userId(), id, caller.userId()) == 1) {
            records.activity(id, caller.userId(), "claim", null, null);
            return;
        }
        Row row = records.lock(id);
        if (LeadVocabulary.DO_NOT_CALL.equals(row.stage())) {
            throw new ConflictException("lead-closed", "This number asked not to be contacted");
        }
        if (row.ownerId() != null) {
            String owner = jdbc.queryForObject(OWNER_NAME, String.class, row.ownerId());
            throw new ConflictException("lead-owned", "Already owned by " + owner);
        }
        throw new ConflictException("lead-cap", "You already have " + LeadVocabulary.OPEN_LEAD_CAP
                + " open leads — close or release some first");
    }

    @Transactional
    public void release(AuthPrincipal caller, UUID id) {
        Row row = records.lock(id);
        if (row.ownerId() == null) {
            return;
        }
        if (!caller.userId().equals(row.ownerId()) && !queries.isManager(caller)) {
            throw new ForbiddenException("Only the owner or a manager can release this lead");
        }
        jdbc.update(RELEASE, id);
        records.activity(id, caller.userId(), "release", null, null);
    }

    @Transactional
    public void assign(AuthPrincipal caller, UUID id, UUID staffId) {
        if (staffId == null) {
            throw new BadRequestException("staffId is required");
        }
        Row row = records.lock(id);
        if (LeadVocabulary.DO_NOT_CALL.equals(row.stage())) {
            throw new ConflictException("lead-closed", "This number asked not to be contacted");
        }
        String target = jdbc.queryForList(BACK_OFFICE_TARGET, String.class, staffId).stream().findFirst()
                .orElseThrow(() -> new BadRequestException("staffId must be an active staff member"));
        jdbc.update(ASSIGN, staffId, id);
        records.activity(id, caller.userId(), "assign", null, "Assigned to " + target);
    }

    @Transactional
    public void numberShown(AuthPrincipal caller, LeadViews.LeadDetail lead) {
        if (lead.mobile() == null) {
            return;
        }
        audit.record(caller, "lead.reveal", "crm_lead", lead.id().toString(), "mask", lead.maskedMobile());
        jdbc.update(VIEWED, lead.id(), caller.userId(), lead.id(), caller.userId());
    }

    @Transactional
    public Landed add(AuthPrincipal caller, NewLead request) {
        String mobile = MobileMask.normalise(request.mobile());
        if (!LeadIngest.validMobile(mobile)) {
            throw new BadRequestException("Enter a valid 10-digit mobile number");
        }
        List<String> interests = LeadVocabulary.services(request.interests());
        LeadProfile profile = LeadProfile.of(request.profile());
        Optional<Landed> landed = ingest.ingest(new Incoming("manual", UUID.randomUUID().toString(), mobile,
                LeadProfile.name(request.profile()), interests, "Added manually", profile));
        Landed result = landed.orElseThrow(() -> new BadRequestException("This number belongs to a staff or "
                + "closed account and cannot be added as a lead"));
        String note = request.note() == null ? "" : request.note().strip();
        if (!note.isEmpty()) {
            records.activity(result.leadId(), caller.userId(), "note", null, note);
        }
        return result;
    }
}
