package com.draazy.api.billing.refund;

import com.draazy.api.billing.entitlement.EntitlementService;
import com.draazy.api.billing.plan.ContactPackTerm;
import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.ContactEnquiryLookup;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Reads the facts behind a paid order and applies {@link RefundPolicy} to them. */
@Component
public class RefundAssessor {

    private static final UUID NO_REQUEST = new UUID(0, 0);

    // Never equal to a stored digest, so a missing signal matches nothing instead of everything.
    private static final String NO_SIGNAL = "-";

    private static final int MONTHS_IN_YEAR = 12;

    // A listing paused to be brought back by the pass it was bought with is not a pause during the window.
    private static final Duration PAUSE_GRACE = Duration.ofMinutes(10);

    private final PlatformSettings settings;
    private final EntitlementService entitlements;
    private final ContactEnquiryLookup enquiries;
    private final RefundRequestRepository requests;
    private final PropertyRepository properties;

    public RefundAssessor(PlatformSettings settings, EntitlementService entitlements,
            ContactEnquiryLookup enquiries, RefundRequestRepository requests, PropertyRepository properties) {
        this.settings = settings;
        this.entitlements = entitlements;
        this.enquiries = enquiries;
        this.requests = requests;
        this.properties = properties;
    }

    public static boolean isPack(Plan plan) {
        return Plan.KIND_CONTACT_PACK.equals(plan.getKind());
    }

    public static boolean isPass(Plan plan) {
        return Plan.KIND_LISTING_PASS.equals(plan.getKind());
    }

    static String kindOf(Plan plan) {
        return isPack(plan) ? RefundStatuses.KIND_CONTACT_PACK : RefundStatuses.KIND_LISTING_PASS;
    }

    /** What the customer may do with this order right now. */
    public RefundVerdict forCustomer(Subscription order, Plan plan, boolean alreadyRequested, String deviceHash,
            Instant now) {
        boolean entitling = SubscriptionStatuses.isEntitling(order.getStatus());
        boolean disputed = SubscriptionStatuses.DISPUTED.equals(order.getStatus());
        boolean requested = alreadyRequested || order.getRefundDueAt() != null
                || SubscriptionStatuses.REFUND_REVIEW.equals(order.getStatus())
                || SubscriptionStatuses.REFUNDED.equals(order.getStatus());
        return evaluate(order, plan, requested, entitling, disputed, deviceHash, now, now, NO_REQUEST, true);
    }

    /** The window is judged as of the request, so a slow review cannot turn a valid request into a late one;
     * enquiries are counted up to now, so one that arrived while it waited still counts. */
    RefundVerdict forDecision(Subscription order, Plan plan, RefundRequest request) {
        return evaluate(order, plan, false, true, false, request.getDeviceIdHash(), request.getCreatedAt(),
                Instant.now(), request.getId(), false);
    }

    public int contactsUsed(Subscription order, Plan plan, Instant asOf) {
        return isPack(plan) && plan.getContactLimit() != null
                ? entitlements.contactsSpentFromPack(order.getUserId(), term(order, plan), asOf) : 0;
    }

    /** Every enquiry from the pass start up to {@code asOf}, so waiting out the window does not hide any. */
    public long enquiries(Subscription order, Instant asOf) {
        return order.getPropertyId() == null ? 0
                : enquiries.enquiriesBetween(order.getPropertyId(), order.getStartedAt(), asOf.plusMillis(1));
    }

    /** True when the listing left the live state at any point in the guarantee window. */
    public boolean pausedDuringWindow(Subscription order) {
        if (order.getPropertyId() == null) {
            return false;
        }
        Instant start = order.getStartedAt();
        return properties.wasNotLiveBetween(order.getPropertyId(), start, start.plus(PAUSE_GRACE),
                start.plusSeconds(settings.passGuaranteeDays() * 86_400L));
    }

    public long refunds12m(UUID userId, String device, String instrument, Instant now) {
        return requests.countLinked("%", now.atZone(ZoneOffset.UTC).minusMonths(MONTHS_IN_YEAR).toInstant(), now,
                NO_REQUEST, userId, orNone(device), orNone(instrument));
    }

    public long linkedAccounts(UUID userId, String device, String instrument) {
        return requests.countLinkedAccounts(userId, orNone(device), orNone(instrument));
    }

    private RefundVerdict evaluate(Subscription order, Plan plan, boolean alreadyRequested, boolean entitling,
            boolean disputed, String deviceHash, Instant asOf, Instant factsAsOf, UUID self, boolean requireLive) {
        RefundPolicy.Rules rules = new RefundPolicy.Rules(Math.toIntExact(settings.packRefundDays()),
                Math.toIntExact(settings.passGuaranteeDays()), Math.toIntExact(settings.passGuaranteeMaxEnquiries()));
        if (isPack(plan)) {
            return RefundPolicy.pack(new RefundPolicy.Pack(alreadyRequested, entitling, order.getStartedAt(),
                    () -> contactsUsed(order, plan, asOf)), rules, asOf);
        }
        Instant since = asOf.atZone(ZoneOffset.UTC).minusMonths(settings.passGuaranteeEveryMonths()).toInstant();
        return RefundPolicy.pass(new RefundPolicy.Pass(alreadyRequested, entitling, disputed, order.getStartedAt(),
                () -> !requireLive || listingLive(order),
                () -> pausedDuringWindow(order),
                () -> enquiries(order, factsAsOf),
                () -> requests.countLinked(RefundStatuses.BASIS_PASS_NO_ENQUIRIES, since, asOf, self,
                        order.getUserId(), orNone(deviceHash), orNone(order.getPaymentInstrumentHash()))),
                rules, asOf);
    }

    private boolean listingLive(Subscription order) {
        return order.getPropertyId() != null && properties.findById(order.getPropertyId())
                .map(p -> p.isPubliclyVisible()).orElse(false);
    }

    private static ContactPackTerm term(Subscription order, Plan plan) {
        return new ContactPackTerm(order.getId(), order.getStartedAt(), order.getRenewsAt(), plan.getContactLimit());
    }

    private static String orNone(String signal) {
        return signal == null ? NO_SIGNAL : signal;
    }
}