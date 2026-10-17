package com.draazy.api.catalog.managed;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

/** One month of rent the owner says arrived outside Draazy. Every field but {@code rentMonth} is snapshotted from
 * the property at recording and never updatable: a receipt must keep saying what it said that month. */
@Entity
@Table(name = "managed_property_rent_receipts")
@Getter
public class ManagedRentReceipt extends AuditedEntity {

    /** Matches the DB CHECK; validated here too so a bad month is a 422, not a constraint violation. */
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
        // JPA
    }

    /** Caller must already have checked ownership, rented state, rent and tenant name; see recordRentReceipt. */
    ManagedRentReceipt(ManagedProperty property, String rentMonth, String landlordName) {
        this.managedPropertyId = property.getId();
        this.rentMonth = rentMonth;
        this.amount = property.getMonthlyRent();
        this.tenantName = fit(property.getTenantName(), 200);
        this.landlordName = fit(landlordName, 200);
        this.propertyAddress = fit(addressOf(property), 500);
    }

    // Both sources are unbounded text, so truncate rather than 500 at flush on a receipt the owner is owed.
    private static String fit(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

    // The property has no address column; the receipt keeps the rendered line because that is what was printed.
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
