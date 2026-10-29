package com.draazy.api.finance.tenancy;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenancyDeclarationService {
    private final TenancyDeclarationRepository declarations;
    private final TenancyRepository tenancies;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final AuditService audit;

    public TenancyDeclarationService(TenancyDeclarationRepository declarations,
            TenancyRepository tenancies, PropertyRepository properties, UserRepository users,
            AuditService audit) {
        this.declarations = declarations;
        this.tenancies = tenancies;
        this.properties = properties;
        this.users = users;
        this.audit = audit;
    }

    @Transactional
    public TenancyDeclarationDto declare(UUID callerId, UUID propertyId,
            TenancyDeclarationCreateRequest body) {
        Property property = properties.findById(propertyId)
                .orElseThrow(() -> NotFoundException.of("Property"));
        UUID ownerId = ownerIdOf(property);
        if (ownerId == null) {
            throw new ConflictException("This listing has no owner account to confirm a stay");
        }
        if (ownerId.equals(callerId)) {
            throw new ConflictException("You cannot declare a tenancy on your own listing");
        }
        if (tenancies.existsByTenantIdAndPropertyId(callerId, propertyId)) {
            throw new ConflictException("Your tenancy on this listing is already on record");
        }
        if (declarations.existsByPropertyIdAndDeclarantId(propertyId, callerId)) {
            throw new ConflictException("You have already declared a stay at this listing");
        }

        TenancyDeclaration saved = declarations.save(new TenancyDeclaration(
                propertyId, callerId, ownerId, body.livedFrom(), body.livedTo()));
        return projectOne(saved);
    }

    @Transactional(readOnly = true)
    public PageResponse<TenancyDeclarationDto> forProperty(UUID callerId, UUID propertyId,
            Pageable pageable) {
        Property property = properties.findById(propertyId)
                .orElseThrow(() -> NotFoundException.of("Property"));
        boolean isOwner = callerId.equals(ownerIdOf(property));
        if (!isOwner) {
            List<TenancyDeclarationDto> mine = project(
                    declarations.findByPropertyIdAndDeclarantId(propertyId, callerId).stream()
                            .toList());
            return new PageResponse<>(mine, 0, Math.max(mine.size(), 1), mine.size(),
                    mine.isEmpty() ? 0 : 1, "createdAt,desc");
        }
        Page<TenancyDeclaration> page =
                declarations.findByPropertyIdOrderByCreatedAtDesc(propertyId, pageable);
        return PageResponse.of(page, projector(page.getContent()));
    }

    @Transactional
    public TenancyDeclarationDto confirm(AuthPrincipal caller, UUID declarationId) {
        return decide(caller, declarationId, TenancyDeclarationStatuses.CONFIRMED);
    }

    // Forward-only: revoking must not retract the review it enabled, or an owner could silence
    // criticism by confirming, waiting for the review, then revoking.
    @Transactional
    public TenancyDeclarationDto revoke(AuthPrincipal caller, UUID declarationId) {
        return decide(caller, declarationId, TenancyDeclarationStatuses.REVOKED);
    }

    private TenancyDeclarationDto decide(AuthPrincipal caller, UUID declarationId, String status) {
        TenancyDeclaration row = requireOwner(caller.userId(), declarationId);
        String previous = row.getStatus();
        if (previous.equals(status)) {
            return projectOne(row);
        }
        row.decide(status);
        audit.record(caller, "tenancy_declaration." + status, "tenancy_declaration",
                declarationId.toString(), "from", previous, "to", status,
                "declarantId", String.valueOf(row.getDeclarantId()),
                "propertyId", String.valueOf(row.getPropertyId()));
        return projectOne(row);
    }

    // 404, never 403: a 403 would confirm to a stranger that this declaration id exists.
    private TenancyDeclaration requireOwner(UUID callerId, UUID declarationId) {
        return declarations.findById(declarationId)
                .filter(d -> callerId.equals(d.getOwnerId()))
                .orElseThrow(() -> NotFoundException.of("Tenancy declaration"));
    }

    private UUID ownerIdOf(Property property) {
        return property.getOwner() == null ? null : property.getOwner().getId();
    }

    private TenancyDeclarationDto projectOne(TenancyDeclaration row) {
        return project(List.of(row)).get(0);
    }

    private List<TenancyDeclarationDto> project(List<TenancyDeclaration> rows) {
        return rows.stream().map(projector(rows)).toList();
    }

    private Function<TenancyDeclaration, TenancyDeclarationDto> projector(
            List<TenancyDeclaration> rows) {
        Set<UUID> ids = rows.stream().map(TenancyDeclaration::getDeclarantId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, User> byId = ids.isEmpty() ? Map.of()
                : users.findAllById(ids).stream()
                        .collect(Collectors.toMap(User::getId, Function.identity()));
        return row -> TenancyMapper.toDto(row, byId.get(row.getDeclarantId()));
    }
}
