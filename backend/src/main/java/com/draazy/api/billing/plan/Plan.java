package com.draazy.api.billing.plan;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** A plan on the public price list; maps {@code plans}. */
@Entity
@Table(name = "plans")
@Getter
public class Plan extends AuditedEntity {

    public static final String KIND_PLAN = "plan";
    public static final String KIND_LISTING_PASS = "listing-pass";
    public static final String KIND_CONTACT_PACK = "contact-pack";

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "audience")
    private String audience;

    /** Whole rupees for one {@link #billingCycle}; zero means free. Ignored for plans the admin fee
     * schedule prices — see {@link PlanMapper#price}. */
    @Column(name = "price", nullable = false)
    private long price;

    @Column(name = "billing_cycle")
    private String billingCycle;

    /** Paid term in days from payment; when set it overrides {@link #billingCycle}. */
    @Column(name = "term_days")
    private Integer termDays;

    @Column(name = "kind", nullable = false)
    private String kind;

    /** Whether the plan is on sale; one already bought is honoured either way. */
    @Column(name = "active", nullable = false)
    private boolean active;

    /** The paywall's real ceiling; {@code null} resolves to the free-tier floor of one, never unlimited. */
    @Column(name = "listing_limit")
    private Integer listingLimit;

    /** Owner contacts this plan grants, or {@code null} for unlimited / not-applicable. */
    @Column(name = "contact_limit")
    private Integer contactLimit;

    /** Lifts the owner-contact ceiling; separate from {@link #contactLimit}, which is display-only. */
    @Column(name = "unlimited_contacts", nullable = false)
    private boolean unlimitedContacts;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "features", nullable = false)
    private List<String> features = new ArrayList<>();

    protected Plan() {
        // JPA
    }

}
