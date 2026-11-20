package com.draazy.api.catalog.society;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SocietyAdminService {
    private final SocietyRepository societies;
    private final AuditService audit;

    public SocietyAdminService(SocietyRepository societies, AuditService audit) {
        this.societies = societies;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Page<SocietyDirectoryRow> directory(String q, Pageable pageable) {
        Pageable page = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), Sort.by("name", "slug"));
        return societies.findAll(SocietySpecs.browse(q, null, null, null), page).map(SocietyDirectoryRow::of);
    }

    @Transactional(readOnly = true)
    public SocietyAdminResponse get(String slug) {
        return SocietyAdminResponse.of(
                societies.findBySlug(slug).orElseThrow(() -> NotFoundException.of("Society")));
    }

    public SocietyAdminResponse edit(String slug, SocietyAdminEditRequest request, AuthPrincipal operator) {
        Society before = societies.findBySlug(slug).orElseThrow(() -> NotFoundException.of("Society"));

        boolean noteGiven = request.adminNote() != null;
        String note = noteGiven && !request.adminNote().isBlank() ? request.adminNote().trim() : null;

        societies.applyAdminEdit(before.getId(), request.registration(), request.conveyance(),
                request.maintenancePerSqft(), noteGiven, note);

        audit.record(operator, "society.edit", "society", slug,
                "wasRegistration", before.isRegistration(),
                "wasConveyance", before.isConveyance(),
                "wasMaintenancePerSqft", before.getMaintenancePerSqft(),
                "hadNote", before.getAdminNote() != null);

        return SocietyAdminResponse.of(
                societies.findBySlug(slug).orElseThrow(() -> NotFoundException.of("Society")));
    }
}
