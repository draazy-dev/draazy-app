package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadIngest.Landed;
import com.draazy.api.admin.leads.LeadRequests.Assign;
import com.draazy.api.admin.leads.LeadRequests.Contact;
import com.draazy.api.admin.leads.LeadRequests.Convert;
import com.draazy.api.admin.leads.LeadRequests.Credit;
import com.draazy.api.admin.leads.LeadRequests.Interests;
import com.draazy.api.admin.leads.LeadRequests.NewLead;
import com.draazy.api.admin.leads.LeadRequests.Note;
import com.draazy.api.admin.leads.LeadRequests.Profile;
import com.draazy.api.admin.leads.LeadRequests.StageChange;
import com.draazy.api.admin.leads.LeadViews.Assignee;
import com.draazy.api.admin.leads.LeadViews.Conversion;
import com.draazy.api.admin.leads.LeadViews.Convertible;
import com.draazy.api.admin.leads.LeadViews.LeadDetail;
import com.draazy.api.admin.leads.LeadViews.LeadSummary;
import com.draazy.api.admin.leads.LeadViews.Performance;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LeadsController {
    private static final String ROLES = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and ";
    private static final String READ = ROLES + BackOfficePermissions.REQUIRE_LEADS_READ;
    private static final String WRITE = ROLES + BackOfficePermissions.REQUIRE_LEADS_WRITE;
    private static final String MANAGE = ROLES + BackOfficePermissions.REQUIRE_LEADS_MANAGE;

    private final LeadQueries queries;
    private final LeadWorkflow workflow;
    private final LeadContacts contacts;
    private final LeadConversions conversions;
    private final LeadPerformance performance;

    public LeadsController(LeadQueries queries, LeadWorkflow workflow, LeadContacts contacts,
            LeadConversions conversions, LeadPerformance performance) {
        this.queries = queries;
        this.workflow = workflow;
        this.contacts = contacts;
        this.conversions = conversions;
        this.performance = performance;
    }

    @GetMapping(Routes.Leads.BASE)
    @PreAuthorize(READ)
    public PageResponse<LeadSummary> list(@CurrentUser AuthPrincipal caller,
            @RequestParam(defaultValue = "mine") String view, @RequestParam(required = false) String q,
            @RequestParam(required = false) String stage, @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.list(caller, view, q, stage, type, page, size);
    }

    @GetMapping(Routes.Leads.BY_ID)
    @PreAuthorize(READ)
    public LeadDetail detail(@CurrentUser AuthPrincipal caller, @PathVariable UUID id) {
        LeadDetail lead = queries.detail(id, caller.userId());
        workflow.numberShown(caller, lead);
        return lead;
    }

    @PostMapping(Routes.Leads.BASE)
    @PreAuthorize(WRITE)
    public ResponseEntity<LeadDetail> add(@CurrentUser AuthPrincipal caller, @RequestBody NewLead request) {
        Landed landed = workflow.add(caller, request);
        return ResponseEntity.status(landed.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(queries.detail(landed.leadId(), caller.userId()));
    }

    @PostMapping(Routes.Leads.CLAIM)
    @PreAuthorize(WRITE)
    public LeadDetail claim(@CurrentUser AuthPrincipal caller, @PathVariable UUID id) {
        workflow.claim(caller, id);
        return queries.detail(id, caller.userId());
    }

    @PostMapping(Routes.Leads.RELEASE)
    @PreAuthorize(WRITE)
    public LeadDetail release(@CurrentUser AuthPrincipal caller, @PathVariable UUID id) {
        workflow.release(caller, id);
        return queries.detail(id, caller.userId());
    }

    @PostMapping(Routes.Leads.ASSIGN)
    @PreAuthorize(MANAGE)
    public LeadDetail assign(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody Assign request) {
        workflow.assign(caller, id, request.staffId());
        return queries.detail(id, caller.userId());
    }

    @GetMapping(Routes.Leads.ASSIGNEES)
    @PreAuthorize(MANAGE)
    public List<Assignee> assignees() {
        return queries.assignees();
    }

    @PostMapping(Routes.Leads.CONTACTS)
    @PreAuthorize(WRITE)
    public LeadDetail contact(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody Contact request) {
        contacts.contact(caller, id, request);
        return queries.detail(id, caller.userId());
    }

    @PostMapping(Routes.Leads.STAGE)
    @PreAuthorize(WRITE)
    public LeadDetail stage(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody StageChange request) {
        contacts.stage(caller, id, request);
        return queries.detail(id, caller.userId());
    }

    @PutMapping(Routes.Leads.INTERESTS)
    @PreAuthorize(WRITE)
    public LeadDetail interests(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody Interests request) {
        contacts.interests(caller, id, request.interests());
        return queries.detail(id, caller.userId());
    }

    @PutMapping(Routes.Leads.PROFILE)
    @PreAuthorize(WRITE)
    public LeadDetail profile(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody Profile request) {
        contacts.profile(caller, id, request);
        return queries.detail(id, caller.userId());
    }

    @PostMapping(Routes.Leads.NOTES)
    @PreAuthorize(WRITE)
    public LeadDetail note(@CurrentUser AuthPrincipal caller, @PathVariable UUID id, @RequestBody Note request) {
        contacts.note(caller, id, request.body());
        return queries.detail(id, caller.userId());
    }

    @GetMapping(Routes.Leads.CONVERTIBLE)
    @PreAuthorize(READ)
    public List<Convertible> convertible(@CurrentUser AuthPrincipal caller, @PathVariable UUID id) {
        return queries.convertible(id, caller);
    }

    @PostMapping(Routes.Leads.CONVERSIONS)
    @PreAuthorize(WRITE)
    public LeadDetail convert(@CurrentUser AuthPrincipal caller, @PathVariable UUID id,
            @RequestBody Convert request) {
        conversions.convert(caller, id, request.serviceRequestId());
        return queries.detail(id, caller.userId());
    }

    @PatchMapping(Routes.Leads.CONVERSION)
    @PreAuthorize(MANAGE)
    public Conversion recredit(@CurrentUser AuthPrincipal caller, @PathVariable UUID conversionId,
            @RequestBody Credit request) {
        return conversions.recredit(caller, conversionId, request.creditedTo());
    }

    @GetMapping(Routes.Leads.PERFORMANCE)
    @PreAuthorize(MANAGE)
    public Performance performance(@RequestParam(required = false) Integer days) {
        return performance.report(days);
    }
}
