package com.draazy.api.common.settings;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class PlatformSettings {

    private static final Logger log = LoggerFactory.getLogger(PlatformSettings.class);

    /** The seeded key holding the fee block (see {@code R__DML_seed_reference_data.sql}). */
    public static final String FEES_KEY = "fees";

    /** The seeded key holding the feature-toggle block, the same one {@code GET /bootstrap} publishes. */
    static final String FLAGS_KEY = "flags";

    /** Every Draazy price already includes GST, so nothing is added on top unless an admin sets a rate. */
    private static final BigDecimal DEFAULT_GST_PERCENT = BigDecimal.ZERO;

    private static final BigDecimal MAX_PERCENT = new BigDecimal("100");

    /** Owner contacts a caller with no subscription may open, before any referral bonus. */
    private static final long DEFAULT_FREE_CONTACT_LIMIT = 15L;

    // Ceiling on the contact numbers.
    // Past a thousand means "no limit"; that belongs in `plans.unlimited_contacts`.
    private static final long MAX_CONTACT_GRANT = 1_000L;

    public record Bound(long fallback, long min, long max) {
    }

    // Every referral and Featured number an admin may set; an out-of-range stored value reads as the fallback.
    public static final Map<String, Bound> FEE_BOUNDS = Map.ofEntries(
            Map.entry("featuredDays", new Bound(7, 1, 90)),
            Map.entry("referralContactBonus", new Bound(15, 0, MAX_CONTACT_GRANT)),
            Map.entry("referralSeekerBonusContacts", new Bound(5, 0, MAX_CONTACT_GRANT)),
            Map.entry("referralOwnerFeaturedDays", new Bound(14, 1, 90)),
            Map.entry("referralOwnerRewardAgreements", new Bound(1, 0, 10)),
            Map.entry("referralQualifyPerMonth", new Bound(10, 1, 1_000)),
            Map.entry("referralQualifyPerYear", new Bound(50, 1, 10_000)),
            Map.entry("referralHoldDays", new Bound(7, 1, 60)),
            Map.entry("referralClawbackDays", new Bound(30, 1, 365)),
            Map.entry("referralVelocityPerDay", new Bound(5, 1, 1_000)),
            Map.entry("referralSignupWindowHours", new Bound(24, 1, 720)),
            Map.entry("referralSignalRetentionDays", new Bound(180, 30, 180)),
            Map.entry("referralNewReferrerDays", new Bound(7, 0, 90)),
            Map.entry("contactReplyDays", new Bound(7, 1, 30)),
            Map.entry("contactPendingMax", new Bound(10, 1, 100)),
            Map.entry("packRefundDays", new Bound(7, 0, 30)),
            Map.entry("passGuaranteeDays", new Bound(7, 0, 30)),
            Map.entry("passGuaranteeMaxEnquiries", new Bound(0, 0, 50)),
            Map.entry("passGuaranteeEveryMonths", new Bound(12, 1, 36)));

    public static final String LEGAL_KEY = "legal";

    public record GrievanceOfficer(String name, String email) {
    }

    // The product prices, in whole rupees.
    // Defaults match a healthy install so broken rows fail instead of changing prices.
    private static final long DEFAULT_LISTING_PASS = 999L;

    private static final long DEFAULT_CONTACT_PACK = 199L;

    private static final long DEFAULT_RENT_AGREEMENT_PLATFORM = 499L;

    public static final int MAX_PRICE = 100_000;

    // An out-of-range price falls back to its default here, so the admin write must refuse one.
    public static final List<String> PRICE_FIELDS = List.of("listingPass", "contactPack",
            "rentAgreementPlatform");

    public static final String LISTINGS_KEY = "listings";

    private static final long DEFAULT_MAX_LISTING_PHOTOS = 10L;

    public static final int MIN_LISTING_PHOTOS = 3;

    public static final int MAX_LISTING_PHOTOS = 20;

    public static final String FLATMATES_KEY = "flatmates";

    private static final long DEFAULT_GROUPS_PER_PERSON = 2L;

    public static final int MIN_GROUPS_PER_PERSON = 1;

    public static final int MAX_GROUPS_PER_PERSON = 10;

    private final SettingRepository settings;
    private final SettingsCache cache;
    private final ObjectMapper objectMapper;

    public PlatformSettings(SettingRepository settings, SettingsCache cache,
            ObjectMapper objectMapper) {
        this.settings = settings;
        this.cache = cache;
        this.objectMapper = objectMapper;
    }

    public BigDecimal gstPercent() {
        return percent(FEES_KEY, "gstPercent", DEFAULT_GST_PERCENT);
    }

    /** GST on a whole-rupee amount at the configured rate, rounded half-up to whole rupees. */
    public long gstOn(long rupees) {
        return BigDecimal.valueOf(rupees).multiply(gstPercent())
                .divide(MAX_PERCENT, 0, RoundingMode.HALF_UP).longValueExact();
    }

    public long listingPass() {
        return wholeNumber(FEES_KEY, "listingPass", DEFAULT_LISTING_PASS, MAX_PRICE);
    }

    public long contactPack() {
        return wholeNumber(FEES_KEY, "contactPack", DEFAULT_CONTACT_PACK, MAX_PRICE);
    }

    public long rentAgreementPlatform() {
        return wholeNumber(FEES_KEY, "rentAgreementPlatform", DEFAULT_RENT_AGREEMENT_PLATFORM,
                MAX_PRICE);
    }

    public long freeContactLimit() {
        return wholeNumber(FEES_KEY, "freeContactLimit", DEFAULT_FREE_CONTACT_LIMIT,
                MAX_CONTACT_GRANT);
    }

    public long featuredDays() {
        return fee("featuredDays");
    }

    public long referralContactBonus() {
        return fee("referralContactBonus");
    }

    public long referralSeekerBonusContacts() {
        return fee("referralSeekerBonusContacts");
    }

    public long referralOwnerFeaturedDays() {
        return fee("referralOwnerFeaturedDays");
    }

    public long referralOwnerRewardAgreements() {
        return fee("referralOwnerRewardAgreements");
    }

    public long referralQualifyPerMonth() {
        return fee("referralQualifyPerMonth");
    }

    public long referralQualifyPerYear() {
        return fee("referralQualifyPerYear");
    }

    public long referralHoldDays() {
        return fee("referralHoldDays");
    }

    public long referralClawbackDays() {
        return fee("referralClawbackDays");
    }

    public long referralVelocityPerDay() {
        return fee("referralVelocityPerDay");
    }

    public long referralSignupWindowHours() {
        return fee("referralSignupWindowHours");
    }

    public long referralSignalRetentionDays() {
        return fee("referralSignalRetentionDays");
    }

    public long referralNewReferrerDays() {
        return fee("referralNewReferrerDays");
    }

    public long contactReplyDays() {
        return fee("contactReplyDays");
    }

    public long contactPendingMax() {
        return fee("contactPendingMax");
    }

    public long packRefundDays() {
        return fee("packRefundDays");
    }

    public long passGuaranteeDays() {
        return fee("passGuaranteeDays");
    }

    public long passGuaranteeMaxEnquiries() {
        return fee("passGuaranteeMaxEnquiries");
    }

    public long passGuaranteeEveryMonths() {
        return fee("passGuaranteeEveryMonths");
    }

    public GrievanceOfficer grievanceOfficer() {
        try {
            JsonNode officer = cache.value(LEGAL_KEY).map(objectMapper::readTree)
                    .map(node -> node.get("grievanceOfficer")).orElse(null);
            if (officer == null || !officer.isObject()) {
                return new GrievanceOfficer(null, null);
            }
            return new GrievanceOfficer(officer.path("name").asString(null), officer.path("email").asString(null));
        } catch (RuntimeException malformed) {
            log.warn("settings.legal could not be read; no grievance officer published", malformed);
            return new GrievanceOfficer(null, null);
        }
    }

    public boolean referralRewardsEnabled() {
        return flag(FLAGS_KEY, "referralRewards", true);
    }

    private long fee(String field) {
        Bound bound = FEE_BOUNDS.get(field);
        return wholeNumber(FEES_KEY, field, bound.fallback(), bound.min(), bound.max());
    }

    public int maxListingPhotos() {
        return (int) wholeNumber(LISTINGS_KEY, "maxPhotos", DEFAULT_MAX_LISTING_PHOTOS,
                MIN_LISTING_PHOTOS, MAX_LISTING_PHOTOS);
    }

    public int maxGroupsPerPerson() {
        return (int) wholeNumber(FLATMATES_KEY, "maxGroupsPerPerson", DEFAULT_GROUPS_PER_PERSON,
                MIN_GROUPS_PER_PERSON, MAX_GROUPS_PER_PERSON);
    }

    public boolean signupsEnabled() {
        return flag(FLAGS_KEY, "signupsEnabled", true);
    }

    public boolean staffLoginEnabled() {
        return flag(FLAGS_KEY, "staffLoginEnabled", true);
    }

    public boolean subscriptionPlansEnabled() {
        return flag(FLAGS_KEY, "subscriptionPlans", true);
    }

    public boolean maintenanceMode() {
        return flag(FLAGS_KEY, "maintenanceMode", false);
    }

    // Read past the cache: these are kill switches, and one must bite on the next request.
    private boolean flag(String key, String field, boolean whenUndecided) {
        Optional<Setting> row = settings.findById(key);
        if (row.isEmpty()) {
            return whenUndecided;
        }
        JsonNode value;
        try {
            value = objectMapper.readTree(row.get().getValue()).get(field);
        } catch (JacksonException malformed) {
            log.warn("settings.{} is not parseable JSON; treating {} as undecided", key, field,
                    malformed);
            return whenUndecided;
        }
        if (value == null || !value.isBoolean()) {
            return whenUndecided;
        }
        return value.booleanValue();
    }

    private long wholeNumber(String key, String field, long fallback, long max) {
        return wholeNumber(key, field, fallback, 0L, max);
    }

    private long wholeNumber(String key, String field, long fallback, long min, long max) {
        try {
            JsonNode value = cache.value(key)
                    .map(objectMapper::readTree)
                    .map(node -> node.get(field))
                    .orElse(null);
            if (value == null || !value.isNumber()) {
                return fallback;
            }
            long parsed = value.asLong();
            if (parsed < min || parsed > max) {
                log.warn("settings.{}.{} is {}, outside [{},{}]; using default {}",
                        key, field, parsed, min, max, fallback);
                return fallback;
            }
            return parsed;
        } catch (RuntimeException malformed) {
            log.warn("settings.{}.{} could not be read; using default {}", key, field, fallback,
                    malformed);
            return fallback;
        }
    }

    private BigDecimal percent(String key, String field, BigDecimal fallback) {
        try {
            JsonNode value = cache.value(key)
                    .map(objectMapper::readTree)
                    .map(node -> node.get(field))
                    .orElse(null);
            if (value == null || !value.isNumber()) {
                return fallback;
            }
            BigDecimal parsed = value.decimalValue();
            if (parsed.signum() < 0 || parsed.compareTo(MAX_PERCENT) > 0) {
                log.warn("settings.{}.{} is {}, outside [0,100]; using default {}",
                        key, field, parsed, fallback);
                return fallback;
            }
            return parsed;
        } catch (RuntimeException malformed) {
            log.warn("settings.{}.{} could not be read; using default {}", key, field, fallback,
                    malformed);
            return fallback;
        }
    }
}
