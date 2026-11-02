package com.draazy.api.admin.leads;

import static com.draazy.api.admin.leads.LeadRecords.instant;

import com.draazy.api.admin.leads.LeadRecords.Row;
import com.draazy.api.admin.leads.LeadViews.Conversion;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadConversions {
    private record Paid(String type, BigDecimal amount) {
    }

    private static final String PAID_REQUEST = """
            select r.type, r.amount from service_requests r
             where r.id = ? and r.requester_id = ? and r.status not in ('awaiting-payment', 'cancelled')
               and not exists (select 1 from crm_lead_conversions c where c.service_request_id = r.id)
            """;

    private static final String INSERT = """
            insert into crm_lead_conversions (lead_id, service_request_id, amount, service, credited_to, converted_by)
            values (?, ?, ?, ?, ?, ?)
            """;

    private static final String MARK_CONVERTED = """
            update crm_leads set stage = 'converted', next_follow_up_at = null, failed_attempts = 0,
                   last_activity_at = now() where id = ?
            """;

    private static final String LEAD_OF = "select lead_id from crm_lead_conversions where id = ?";

    private static final String RECREDIT = "update crm_lead_conversions set credited_to = ? where id = ?";

    private static final String TARGET_NAME = """
            select coalesce(name, 'Staff') from users
             where id = ? and role in ('staff', 'manager', 'admin') and not archived
            """;

    private static final String ONE = """
            select c.id, c.service_request_id, c.service, c.amount, c.credited_to, u.name as credited_name,
                   c.created_at
              from crm_lead_conversions c left join users u on u.id = c.credited_to
             where c.id = ?
            """;

    private final JdbcTemplate jdbc;
    private final LeadRecords records;
    private final AuditService audit;

    LeadConversions(JdbcTemplate jdbc, LeadRecords records, AuditService audit) {
        this.jdbc = jdbc;
        this.records = records;
        this.audit = audit;
    }

    @Transactional
    public void convert(AuthPrincipal caller, UUID leadId, UUID serviceRequestId) {
        Row row = records.owned(leadId, caller.userId());
        if (LeadVocabulary.DO_NOT_CALL.equals(row.stage())) {
            throw new ConflictException("lead-closed", "This number asked not to be contacted");
        }
        if (serviceRequestId == null || row.userId() == null) {
            throw invalid();
        }
        Paid paid = jdbc.query(PAID_REQUEST, (rs, i) -> new Paid(rs.getString("type"), rs.getBigDecimal("amount")),
                serviceRequestId, row.userId()).stream().findFirst().orElseThrow(LeadConversions::invalid);
        try {
            jdbc.update(INSERT, leadId, serviceRequestId, paid.amount(), paid.type(), caller.userId(),
                    caller.userId());
        } catch (DuplicateKeyException e) {
            throw invalid();
        }
        jdbc.update(MARK_CONVERTED, leadId);
        records.activity(leadId, caller.userId(), "convert", null, "Converted " + paid.type());
    }

    @Transactional
    public Conversion recredit(AuthPrincipal caller, UUID conversionId, UUID creditedTo) {
        UUID leadId = jdbc.queryForList(LEAD_OF, UUID.class, conversionId).stream().findFirst()
                .orElseThrow(() -> NotFoundException.of("Conversion"));
        if (creditedTo == null) {
            throw new BadRequestException("creditedTo is required");
        }
        String target = jdbc.queryForList(TARGET_NAME, String.class, creditedTo).stream().findFirst()
                .orElseThrow(() -> new BadRequestException("creditedTo must be an active staff member"));
        jdbc.update(RECREDIT, creditedTo, conversionId);
        records.activity(leadId, caller.userId(), "convert", null, "Credit moved to " + target);
        audit.record(caller, "lead.credit-override", "crm_lead_conversion", conversionId.toString(),
                "creditedTo", creditedTo.toString());
        return jdbc.queryForObject(ONE, (rs, i) -> new Conversion(rs.getObject("id", UUID.class),
                rs.getObject("service_request_id", UUID.class), rs.getString("service"), rs.getBigDecimal("amount"),
                rs.getObject("credited_to", UUID.class), rs.getString("credited_name"), instant(rs, "created_at")),
                conversionId);
    }

    private static ConflictException invalid() {
        return new ConflictException("lead-conversion-invalid",
                "Pick a paid request from this customer that has not been counted yet");
    }
}
