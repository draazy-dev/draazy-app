package com.draazy.api.catalog.managed;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class ManagedPropertyMapper {
    private final RentClaims claims;

    ManagedPropertyMapper(RentClaims claims) {
        this.claims = claims;
    }

    public ManagedPropertyDto toDto(ManagedProperty m) {
        return toDto(m, claims.pending(m));
    }

    private ManagedPropertyDto toDto(ManagedProperty m, List<String> pendingClaims) {
        return new ManagedPropertyDto(
                m.getId().toString(),
                m.getTitle(),
                m.getDeal(),
                m.getPropertyType(),
                m.getBhk(),
                m.getPrice(),
                m.getLocality(),
                m.getLocalitySlug(),
                m.getSociety(),
                m.getArea(),
                m.getAreaUnit(),
                m.getFurnishing(),
                m.getVisibility(),
                m.getStatus(),
                m.isRented(),
                m.getTenantName(),
                m.getTenantMobile(),
                m.getMonthlyRent(),
                m.getDueDay(),
                m.getLeaseEnd(),
                m.getDeposit(),
                m.getLandlordPan(),
                policeIntimation(m),
                pendingClaims,
                Objects.toString(TrackedRentService.firstRentMonth(m), null),
                m.getValuation(),
                Objects.toString(m.getPublishedListingId(), null),
                Objects.toString(m.getSourceRoomId(), null),
                m.getCreatedAt(),
                m.getUpdatedAt(),
                m.getAgreementRequestId() != null);
    }

    // Registering on the IGR portal informs the police (i-SARITA → CCTNS), so a Draazy agreement is done.
    static String policeIntimation(ManagedProperty m) {
        return m.getAgreementRequestId() == null ? null : "done";
    }

    public List<ManagedPropertyDto> toDtos(List<ManagedProperty> records) {
        Map<UUID, List<String>> pending = claims.pending(records);
        return records.stream().map(m -> toDto(m, pending.getOrDefault(m.getId(), List.of()))).toList();
    }

    public ManagedRentReceiptDto toDto(ManagedRentReceipt r) {
        return new ManagedRentReceiptDto(
                r.getId().toString(),
                r.getRentMonth(),
                r.getAmount(),
                r.getTenantName(),
                r.getLandlordName(),
                r.getPropertyAddress(),
                r.getCreatedAt());
    }

    public List<ManagedRentReceiptDto> toReceiptDtos(List<ManagedRentReceipt> receipts) {
        return receipts.stream().map(this::toDto).toList();
    }
}
