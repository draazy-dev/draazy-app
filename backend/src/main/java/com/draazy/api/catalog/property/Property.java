package com.draazy.api.catalog.property;

import com.draazy.api.common.persistence.SoftDeleteEntity;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserStatuses;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Formula;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "properties")
@Getter
public class Property extends SoftDeleteEntity {
    public static final String OWNERSHIP_REVIEW_ITEM = "Ownership documents";

    public static final String OWNER_DELETE_REASON = "Taken down by the owner";

    @Column(name = "slug")
    @Setter
    private String slug;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "title", nullable = false)
    @Setter
    private String title;

    @Column(name = "deal", nullable = false)
    @Setter
    private String deal;

    @Column(name = "property_type", nullable = false)
    @Setter
    private String propertyType;

    @Column(name = "property_type_key", insertable = false, updatable = false)
    private String propertyTypeKey;

    @Column(name = "commercial_use_key", insertable = false, updatable = false)
    private String commercialUseKey;

    @Column(name = "share_type", insertable = false, updatable = false)
    private String shareType;

    @Column(name = "bhk")
    @Setter
    private BigDecimal bhk;

    @Column(name = "price", nullable = false)
    @Setter
    private Long price;

    @Column(name = "price_unit")
    @Setter
    private String priceUnit;

    @Column(name = "deposit")
    @Setter
    private Long deposit;

    @Column(name = "maintenance")
    @Setter
    private Long maintenance;

    @Column(name = "negotiable")
    @Setter
    private Boolean negotiable;

    @Column(name = "area")
    @Setter
    private BigDecimal area;

    @Column(name = "area_unit")
    @Setter
    private String areaUnit = "sqft";

    @Column(name = "carpet_area")
    @Setter
    private BigDecimal carpetArea;

    @Column(name = "built_up_area")
    @Setter
    private BigDecimal builtUpArea;

    @Column(name = "super_built_up_area")
    @Setter
    private BigDecimal superBuiltUpArea;

    @Column(name = "furnishing")
    @Setter
    private String furnishing;

    @Column(name = "floor")
    @Setter
    private Integer floor;

    @Column(name = "total_floors")
    @Setter
    private Integer totalFloors;

    @Column(name = "facing")
    @Setter
    private String facing;

    @Column(name = "overlooking")
    @Setter
    private String overlooking;

    @Column(name = "bathrooms")
    @Setter
    private Integer bathrooms;

    @Column(name = "parking")
    @Setter
    private Integer parking;

    @Column(name = "balconies")
    @Setter
    private Integer balconies;

    @Column(name = "possession")
    @Setter
    private String possession;

    @Column(name = "land_use")
    @Setter
    private String landUse;

    @Column(name = "age_years")
    @Setter
    private Integer ageYears;

    @Column(name = "room")
    @Setter
    private String room;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tenants", nullable = false)
    @Setter
    private List<String> tenants = new ArrayList<>();

    @Column(name = "available_on")
    @Setter
    private LocalDate availableOn;

    public String getAvailableFrom() {
        return AvailableOn.bucketOf(availableOn, AvailableOn.today());
    }

    @Column(name = "pets")
    @Setter
    private Boolean pets;

    @Column(name = "quality_score", insertable = false, updatable = false)
    private Short qualityScore;

    @Column(name = "locality", nullable = false)
    @Setter
    private String locality;

    @Column(name = "locality_slug")
    @Setter
    private String localitySlug;

    @Column(name = "society_id")
    @Setter
    private UUID societyId;

    @Formula("(select s.slug from societies s where s.id = society_id)")
    @Setter
    private String societySlug;

    @Formula("(select s.name from societies s where s.id = society_id)")
    @Setter
    private String societyName;

    @Column(name = "city", nullable = false)
    @Setter
    private String city = "Pune";

    @Column(name = "lat")
    @Setter
    private Double lat;

    @Column(name = "lng")
    @Setter
    private Double lng;

    @Column(name = "address")
    @Setter
    private String address;

    // Never emit in a response: with a surname it is enough to impersonate a utility consumer.
    @Column(name = "electricity_meter_no")
    @Setter
    private String electricityMeterNo;

    @Column(name = "electricity_meter_key")
    @Setter
    private String electricityMeterKey;

    @Column(name = "address_key")
    @Setter
    private String addressKey;

    @Column(name = "pincode")
    @Setter
    private String pincode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "form_details")
    @Setter
    private Map<String, Object> formDetails;

    @Column(name = "rera_id")
    private String reraId;

    @Column(name = "rera_check")
    private String reraCheck;

    @Column(name = "rera_checked_at")
    private Instant reraCheckedAt;

    @Column(name = "rera_checked_by")
    private UUID reraCheckedBy;

    @Column(name = "description")
    @Setter
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "amenities", nullable = false)
    @Setter
    private List<String> amenities = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "images", nullable = false)
    @Setter
    private List<String> images = new ArrayList<>();

    @Column(name = "cover_image")
    @Setter
    private String coverImage;

    @Column(name = "floor_plan")
    @Setter
    private String floorPlan;

    @Column(name = "video")
    @Setter
    private String video;

    @Column(name = "purge_after")
    private Instant purgeAfter;

    @Column(name = "content_purged_at")
    private Instant contentPurgedAt;

    @Column(name = "status", nullable = false)
    private String status = PropertyStatus.PENDING;

    @Column(name = "claim_link_sent_at")
    private Instant claimLinkSentAt;

    @Column(name = "claim_link_opened_at")
    private Instant claimLinkOpenedAt;

    @Column(name = "owner_confirmed_at")
    private Instant ownerConfirmedAt;

    @Column(name = "review_started_at")
    private Instant reviewStartedAt;

    @Column(name = "info_requested_at")
    private Instant infoRequestedAt;

    @jakarta.persistence.Version
    @Column(name = "version", nullable = false)
    private long version;

    public void setStatus(String status) {
        this.status = status;
        this.reviewStartedAt = null;
        this.infoRequestedAt = null;
    }

    public void pauseByOwner() {
        this.status = PropertyStatus.PAUSED;
    }

    public void resumeByOwner() {
        setStatus(PropertyStatus.APPROVED);
    }

    public void deleteByOwner(Instant purgeAfter) {
        archive(OWNER_DELETE_REASON);
        this.purgeAfter = purgeAfter;
    }

    @Override
    public void archive(String reason) {
        super.archive(reason);
        this.purgeAfter = null;
    }

    @Override
    public void restore() {
        super.restore();
        this.purgeAfter = null;
    }

    public boolean isContentPurged() {
        return contentPurgedAt != null;
    }

    public boolean isDeletedByOwner() {
        return isArchived() && OWNER_DELETE_REASON.equals(getArchiveReason());
    }

    public Set<String> storedFiles() {
        Set<String> files = new LinkedHashSet<>(images);
        Stream.of(coverImage, floorPlan, video).filter(Objects::nonNull).forEach(files::add);
        return files;
    }

    public Set<String> purgeContent(Instant at) {
        Set<String> files = storedFiles();
        images = new ArrayList<>();
        coverImage = null;
        floorPlan = null;
        video = null;
        amenities = new ArrayList<>();
        description = null;
        formDetails = null;
        address = null;
        addressKey = null;
        lat = null;
        lng = null;
        electricityMeterNo = null;
        electricityMeterKey = null;
        contentPurgedAt = at;
        return files;
    }

    public void startReview() {
        if (reviewStartedAt == null) {
            reviewStartedAt = Instant.now();
        }
    }

    public void requestInfo() {
        startReview();
        infoRequestedAt = Instant.now();
    }

    public void setReraId(String reraId) {
        if (!Objects.equals(this.reraId, reraId)) {
            recordReraCheck(null, null);
        }
        this.reraId = reraId;
    }

    public void recordReraCheck(String result, UUID checkedBy) {
        this.reraCheck = result;
        this.reraCheckedAt = result == null ? null : Instant.now();
        this.reraCheckedBy = result == null ? null : checkedBy;
    }

    public boolean isReraVerified() {
        return ReraCheck.VERIFIED.equals(reraCheck);
    }

    public void provideInfo() {
        startReview();
        infoRequestedAt = null;
        recordResubmission();
    }

    public boolean isAwaitingOwnerInfo() {
        return infoRequestedAt != null;
    }

    public void recordClaimLinkSent() {
        if (postedByAdmin && claimLinkSentAt == null) {
            claimLinkSentAt = Instant.now();
        }
    }

    public void recordClaimLinkOpened() {
        if (claimLinkOpenedAt == null) {
            claimLinkOpenedAt = Instant.now();
        }
    }

    public void confirmByOwner() {
        if (postedByAdmin && ownerConfirmedAt == null) {
            ownerConfirmedAt = Instant.now();
        }
    }

    public boolean awaitsOwnerConfirmation() {
        return postedByAdmin && ownerConfirmedAt == null;
    }

    @Column(name = "deal_status", nullable = false)
    @Setter
    private String dealStatus = "active";

    public static final String FEATURED_SQL = """
            coalesce(ownership_verified = true and ownership_verified_at > now() - interval '1 day' \
            * coalesce(featured_days, \
            (select cast(s.value ->> 'featuredDays' as integer) from settings s \
            where s.key = 'fees' and s.value ->> 'featuredDays' ~ '^[0-9]{1,3}$'), 7), false)""";

    @Formula("(" + FEATURED_SQL + ")")
    private boolean featured;

    @Column(name = "demo", nullable = false)
    private boolean demo;

    @Column(name = "flag_reason")
    @Setter
    private String flagReason;

    @Column(name = "recheck_requested_at")
    private Instant recheckRequestedAt;

    @Column(name = "resubmitted_at")
    private Instant resubmittedAt;

    @Column(name = "recheck_reason")
    private String recheckReason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "recheck_changes")
    private List<Map<String, String>> recheckChanges;

    @Column(name = "posted_by_admin", nullable = false)
    private boolean postedByAdmin = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "admin_pipeline", nullable = false)
    private Map<String, Object> adminPipeline = new LinkedHashMap<>();

    public void markPostedOnBehalf(String staffId) {
        this.postedByAdmin = true;
        this.adminPipeline = new LinkedHashMap<>(this.adminPipeline);
        this.adminPipeline.put("postedByStaff", staffId);
    }

    public String getPostedByStaff() {
        Object value = adminPipeline.get("postedByStaff");
        return value == null ? null : value.toString();
    }

    public boolean isMadeBy(UUID userId) {
        return userId.equals(owner.getId()) || userId.toString().equals(getPostedByStaff());
    }

    @Column(name = "verified", nullable = false)
    @Setter
    private boolean verified = false;

    @Column(name = "owner_verified", nullable = false)
    @Setter
    private boolean ownerVerified = false;

    @Column(name = "ownership_verified", nullable = false)
    private boolean ownershipVerified = false;

    @Column(name = "ownership_verified_at")
    private Instant ownershipVerifiedAt;

    @Column(name = "ownership_verified_until")
    private Instant ownershipVerifiedUntil;

    @Column(name = "ownership_requested_at")
    private Instant ownershipRequestedAt;

    @Column(name = "ownership_declined_at")
    private Instant ownershipDeclinedAt;

    @Column(name = "ownership_declined_reason")
    private String ownershipDeclinedReason;

    @Column(name = "last_confirmed_at")
    private Instant lastConfirmedAt;

    public void confirmAvailable(Instant at) {
        this.lastConfirmedAt = at;
    }

    @Column(name = "docs_count", nullable = false)
    @Setter
    private int docsCount = 0;

    @Column(name = "views", nullable = false, updatable = false)
    private int views = 0;

    @Column(name = "enquiries", nullable = false)
    @Setter
    private int enquiries = 0;

    protected Property() {
    }

    public Property(User owner, String title, String deal, String propertyType, Long price,
            String locality, String city) {
        this.owner = owner;
        this.title = title;
        this.deal = deal;
        this.propertyType = propertyType;
        this.price = price;
        this.locality = locality;
        this.city = city;
    }

    public boolean isPubliclyVisible() {
        return !isArchived() && PropertyStatus.APPROVED.equals(status) && !isOwnerSuspended();
    }

    public boolean isOwnerSuspended() {
        return owner != null && UserStatuses.SUSPENDED.equals(owner.getStatus());
    }

    public boolean isDirectlyReachable() {
        return !isArchived() && PropertyStatus.DIRECTLY_REACHABLE.contains(status) && !isOwnerSuspended();
    }

    public void revertToPending() {
        setStatus(PropertyStatus.PENDING);
        clearRecheck();
    }

    public void recordResubmission() {
        this.resubmittedAt = Instant.now();
    }

    public void requestRecheck(List<String> fields) {
        if (fields == null || fields.isEmpty() || isArchived()
                || !(PropertyStatus.APPROVED.equals(status) || PropertyStatus.PAUSED.equals(status)
                || PropertyStatus.FLAGGED.equals(status))) {
            return;
        }
        boolean wasBadgeOnly = OWNERSHIP_REVIEW_ITEM.equals(recheckReason);
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        if (recheckReason != null && !recheckReason.isBlank()) {
            Collections.addAll(merged, recheckReason.split(",\\s*"));
        }
        merged.addAll(fields);
        this.recheckReason = String.join(", ", merged);
        if (recheckRequestedAt == null || (wasBadgeOnly && !OWNERSHIP_REVIEW_ITEM.equals(recheckReason))) {
            this.recheckRequestedAt = Instant.now();
        }
        recordResubmission();
    }

    public void recordRecheckChanges(List<Map<String, String>> changes) {
        if (changes == null || changes.isEmpty() || isArchived()
                || !(PropertyStatus.APPROVED.equals(status) || PropertyStatus.PAUSED.equals(status)
                || PropertyStatus.FLAGGED.equals(status))) {
            return;
        }
        Map<String, Map<String, String>> byField = new LinkedHashMap<>();
        if (recheckChanges != null) {
            recheckChanges.forEach(change -> byField.put(change.get("field"), change));
        }
        changes.forEach(change -> byField.merge(change.get("field"), change, (kept, latest) ->
                Map.of("field", kept.get("field"), "before", kept.get("before"), "after", latest.get("after"))));
        this.recheckChanges = List.copyOf(byField.values());
    }

    public void requestOwnershipReview(Instant at) {
        if (ownershipRequestedAt == null) {
            this.ownershipRequestedAt = at;
        }
        this.ownershipDeclinedAt = null;
        this.ownershipDeclinedReason = null;
        requestRecheck(List.of(OWNERSHIP_REVIEW_ITEM));
    }

    public void declineOwnershipReview(String reason, Instant at) {
        this.ownershipRequestedAt = null;
        this.ownershipDeclinedAt = at;
        this.ownershipDeclinedReason = reason;
        dropRecheckItem(OWNERSHIP_REVIEW_ITEM);
    }

    public boolean isOwnershipRequested() {
        return ownershipRequestedAt != null;
    }

    public void clearRecheck() {
        if (ownershipRequestedAt != null && !isArchived()
                && (PropertyStatus.APPROVED.equals(status) || PropertyStatus.PAUSED.equals(status))) {
            this.recheckReason = OWNERSHIP_REVIEW_ITEM;
            this.recheckRequestedAt = ownershipRequestedAt;
            this.recheckChanges = null;
            return;
        }
        this.recheckRequestedAt = null;
        this.recheckReason = null;
        this.recheckChanges = null;
    }

    public boolean isRecheckPending() {
        return recheckRequestedAt != null;
    }

    public boolean isOwnershipVerified() {
        return isOwnershipVerifiedAt(Instant.now());
    }

    public boolean isOwnershipVerifiedAt(Instant at) {
        return ownershipVerified
                && (ownershipVerifiedUntil == null || ownershipVerifiedUntil.isAfter(at));
    }

    public void verifyOwnership(Instant at, Instant until) {
        this.ownershipVerified = true;
        this.ownershipVerifiedAt = at;
        this.ownershipVerifiedUntil = until;
        this.ownershipRequestedAt = null;
        this.ownershipDeclinedAt = null;
        this.ownershipDeclinedReason = null;
        dropRecheckItem(OWNERSHIP_REVIEW_ITEM);
    }

    private void dropRecheckItem(String item) {
        if (recheckReason == null) return;
        List<String> rest = Arrays.stream(recheckReason.split(",\\s*"))
                .filter(field -> !field.isBlank() && !field.equals(item))
                .toList();
        if (rest.isEmpty()) {
            this.recheckRequestedAt = null;
            this.recheckReason = null;
            this.recheckChanges = null;
        } else {
            this.recheckReason = String.join(", ", rest);
        }
    }

    public void revokeOwnershipVerification() {
        this.ownershipVerified = false;
        this.ownershipVerifiedAt = null;
        this.ownershipVerifiedUntil = null;
    }
}
