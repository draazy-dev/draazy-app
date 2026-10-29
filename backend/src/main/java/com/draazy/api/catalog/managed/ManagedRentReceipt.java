package com.draazy.api.catalog.managed;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "managed_property_rent_receipts")
@Getter
public class ManagedRentReceipt extends AuditedEntity {
    static final String MONTH_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$";

    @Column(name = "managed_property_id", nullable = false, updatable = false)
    private UUID managedPropertyId;

    @Column(name = "rent_month", nullable = false, updatable = false, length = 7)
    private String rentMonth;

    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "tenant_name", nullable = false, updatable = false, length = 200)
    private String tenantName;

    @Column(name = "landlord_name", nullable = false, updatable = false, length = 200)
    private String landlordName;

    @Column(name = "property_address", nullable = false, updatable = false, length = 500)
    private String propertyAddress;

    protected ManagedRentReceipt() {
    }

    ManagedRentReceipt(ManagedProperty property, String rentMonth, String landlordName) {
        this.managedPropertyId = property.getId();
        this.rentMonth = rentMonth;
        this.amount = property.getMonthlyRent();
        this.tenantName = fit(property.getTenantName(), 200);
        this.landlordName = fit(landlordName, 200);
        this.propertyAddress = fit(addressOf(property), 500);
    }

    private static String fit(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

    static String addressOf(ManagedProperty property) {
        StringBuilder out = new StringBuilder();
        for (String part : new String[] { property.getSociety(), property.getLocality(), "Pune" }) {
            if (part != null && !part.isBlank()) {
                out.append(out.isEmpty() ? "" : ", ").append(part.trim());
            }
        }
        return out.toString();
    }
}
