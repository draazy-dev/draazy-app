package com.draazy.api.catalog.managed;

import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class ManagedPropertyMapper {

    public ManagedPropertyDto toDto(ManagedProperty m) {
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
                m.getValuation(),
                Objects.toString(m.getPublishedListingId(), null),
                m.getCreatedAt(),
                m.getUpdatedAt());
    }

    public List<ManagedPropertyDto> toDtos(List<ManagedProperty> records) {
        return records.stream().map(this::toDto).toList();
    }

    /** Never re-derived from the parent property: reading it would rewrite receipts a tenant already holds. */
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

    /** Not {@code toDtos}: erasure makes both list overloads the same signature. */
    public List<ManagedRentReceiptDto> toReceiptDtos(List<ManagedRentReceipt> receipts) {
        return receipts.stream().map(this::toDto).toList();
    }
}
