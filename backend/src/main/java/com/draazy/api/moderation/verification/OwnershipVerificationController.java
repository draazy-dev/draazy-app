package com.draazy.api.moderation.verification;

import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.DocumentSummary;
import com.draazy.api.documents.vault.DocumentUrl;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OwnershipVerificationController {
    private static final String PROPERTIES_VERIFY =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and "
                    + BackOfficePermissions.REQUIRE_PROPERTIES_VERIFY;

    private final OwnershipVerificationService service;

    public OwnershipVerificationController(OwnershipVerificationService service) {
        this.service = service;
    }

    @GetMapping(Routes.Moderation.VERIFICATION_OWNERSHIP)
    public OwnershipVerificationResponse get(@CurrentUser AuthPrincipal principal,
            @PathVariable String id) {
        return service.get(principal, id);
    }

    @GetMapping(Routes.Moderation.VERIFICATION_OWNERSHIP_DOCUMENTS)
    @PreAuthorize(PROPERTIES_VERIFY)
    public List<DocumentSummary> listDocuments(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.listDocuments(principal, id);
    }

    @GetMapping(Routes.Moderation.VERIFICATION_OWNERSHIP_DOCUMENT_URL)
    @PreAuthorize(PROPERTIES_VERIFY)
    public DocumentUrl documentUrl(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @PathVariable String docId) {
        return service.documentUrl(principal, id, docId);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_OWNERSHIP_EVIDENCE)
    @PreAuthorize(PROPERTIES_VERIFY)
    @ResponseStatus(HttpStatus.CREATED)
    public OwnershipVerificationResponse recordEvidence(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody EvidenceRequest body) {
        return service.recordEvidence(principal, id, body.docType(), body.documentId(),
                body.issuedOn(), body.subjectName());
    }

    @PostMapping(Routes.Moderation.VERIFICATION_OWNERSHIP)
    @PreAuthorize(PROPERTIES_VERIFY)
    public OwnershipVerificationResponse verify(@CurrentUser AuthPrincipal principal,
            @PathVariable String id) {
        return service.verify(principal, id);
    }

    @DeleteMapping(Routes.Moderation.VERIFICATION_OWNERSHIP)
    @PreAuthorize(PROPERTIES_VERIFY)
    public OwnershipVerificationResponse revoke(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @RequestParam String reason) {
        return service.revoke(principal, id, reason);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_OWNERSHIP_REQUEST)
    public OwnershipVerificationResponse request(@CurrentUser AuthPrincipal principal,
            @PathVariable String id) {
        return service.request(principal, id);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_OWNERSHIP_DECLINE)
    @PreAuthorize(PROPERTIES_VERIFY)
    public OwnershipVerificationResponse decline(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody DeclineRequest body) {
        return service.decline(principal, id, body.reason());
    }

    public record DeclineRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record EvidenceRequest(
            @NotBlank String docType,
            String documentId,
            @NotNull LocalDate issuedOn,
            @Size(max = 120) String subjectName) {
    }
}
