package com.draazy.api.deals.visit;

import com.draazy.api.common.trust.PropertyExperience;
import com.draazy.api.common.trust.ReviewerStanding;
import com.draazy.api.finance.tenancy.TenancyDeclarationRepository;
import com.draazy.api.finance.tenancy.TenancyRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PropertyExperienceService implements PropertyExperience {
    private final VisitRepository visits;
    private final TenancyRepository tenancies;
    private final TenancyDeclarationRepository declarations;

    public PropertyExperienceService(VisitRepository visits, TenancyRepository tenancies,
            TenancyDeclarationRepository declarations) {
        this.visits = visits;
        this.tenancies = tenancies;
        this.declarations = declarations;
    }

    @Override
    @Transactional(readOnly = true)
    public ReviewerStanding standingOf(UUID userId, UUID propertyId) {
        if (userId == null || propertyId == null) {
            return ReviewerStanding.NONE;
        }
        if (tenancies.existsByTenantIdAndPropertyId(userId, propertyId)
                || declarations.existsConfirmedFor(userId, propertyId)) {
            return ReviewerStanding.TENANT;
        }
        if (visits.existsByVisitorIdAndPropertyIdAndStatus(userId, propertyId,
                VisitStatuses.COMPLETED)) {
            return ReviewerStanding.VISITED;
        }
        return ReviewerStanding.NONE;
    }
}
