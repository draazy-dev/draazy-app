package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.ReraCheck;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Records what staff found when they looked the listing's RERA ID up on MahaRERA. */
@Service
public class PropertyReraCheckService {

    private final PropertyRepository properties;
    private final PropertyLifecycle lifecycle;
    private final VerificationCases cases;
    private final AuditService audit;
    private final PropertyVerificationService verification;
    private final AccountPermissions permissions;

    public PropertyReraCheckService(PropertyRepository properties, PropertyLifecycle lifecycle,
            VerificationCases cases, AuditService audit, PropertyVerificationService verification,
            AccountPermissions permissions) {
        this.permissions = permissions;
        this.properties = properties;
        this.lifecycle = lifecycle;
        this.cases = cases;
        this.audit = audit;
        this.verification = verification;
    }

    @Transactional
    public PropertyReviewResponse record(AuthPrincipal actor, String propertyId, String result) {
        String normalized = result == null ? "" : result.trim();
        if (!ReraCheck.ALL.contains(normalized)) {
            throw new BadRequestException("invalid_rera_check", "result must be one of "
                    + String.join(", ", ReraCheck.ALL.stream().sorted().toList()));
        }
        Property property = Ids.parseUuid(propertyId).flatMap(properties::findForVerificationDecision)
                .orElseThrow(() -> NotFoundException.of("Property"));
        lifecycle.requireChecker(actor, property);
        if (!permissions.granted(actor, BackOfficePermissions.PROPERTIES_VERIFY)) {
            throw new ForbiddenException("Property verification permission is required");
        }
        lifecycle.requireActive(property);
        if (property.getReraId() == null || property.getReraId().isBlank()) {
            throw new ConflictException("rera_id_missing", "This listing has no RERA ID to check");
        }
        PropertyReview review = cases.ensure(property.getId(), property.getDeal());
        property.recordReraCheck(normalized, actor.userId());
        review.getChecklist().stream()
                .filter(item -> VerificationCases.RERA_ITEM.equals(item.getItem()))
                .forEach(item -> item.mark(ReraCheck.VERIFIED.equals(normalized), actor.userId()));
        audit.record(actor, "property.rera.check", "property", propertyId,
                "result", normalized, "reraId", property.getReraId(),
                "owner", String.valueOf(property.getOwner().getId()));
        return verification.get(actor, propertyId);
    }
}
