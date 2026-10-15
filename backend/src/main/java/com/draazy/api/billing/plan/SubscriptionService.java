package com.draazy.api.billing.plan;

import com.draazy.api.billing.credit.Invoices;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.payments.CheckoutTtl;
import com.draazy.api.common.persistence.ConstraintViolations;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.security.AuthPrincipal;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

// A free plan is active immediately because there is no money to wait for.
// Priced subscriptions become active only through the signature-verified webhook path.
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private static final int MAX_OPEN_UNPAID_PER_USER = 1;

    // Named here so its violation can be told apart from the idempotency index.
    private static final String OPEN_UNPAID_INDEX = "uq_subscriptions_open_unpaid";

    private static final ZoneId TERM_ZONE = PlatformTime.IST;

    private static final int MONTHLY = 1;
    private static final int QUARTERLY = 3;
    private static final int YEARLY = 12;

    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final PlanMapper mapper;
    private final PaymentGateway gateway;
    private final UserRepository users;
    private final PlatformSettings platformSettings;
    private final ListingPasses passes;
    private final Invoices invoices;
    private final CheckoutTtl ttl;

    private final TransactionTemplate transactions;

    public SubscriptionService(PlanRepository plans, SubscriptionRepository subscriptions,
            PlanMapper mapper, PaymentGateway gateway, UserRepository users,
            PlatformSettings platformSettings, ListingPasses passes, Invoices invoices,
            CheckoutTtl ttl, PlatformTransactionManager transactionManager) {
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.mapper = mapper;
        this.gateway = gateway;
        this.users = users;
        this.platformSettings = platformSettings;
        this.passes = passes;
        this.invoices = invoices;
        this.ttl = ttl;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Transactional(readOnly = true)
    public List<PlanDto> listPlans() {
        return mapper.toPlanDtos(plans.findAllByActiveTrueOrderByPriceAsc());
    }

    @Transactional(readOnly = true)
    public SubscriptionDto getSubscription(AuthPrincipal caller) {
        return currentFor(caller.userId()).map(mapper::toDto).orElseGet(SubscriptionDto::none);
    }

    @Transactional
    public boolean cancelPending(AuthPrincipal caller) {
        List<Subscription> pending = subscriptions.findByUserIdOrderByStartedAtDesc(caller.userId()).stream()
                .filter(s -> SubscriptionStatuses.PENDING.equals(s.getStatus()))
                .toList();
        boolean cancelled = false;
        for (Subscription s : pending) {
            if (s.abandonCheckout()) {
                subscriptions.saveAndFlush(s);
                cancelled = true;
            }
        }
        return cancelled;
    }

    public SubscriptionDto subscribe(AuthPrincipal caller, SubscribeRequest body,
            String idempotencyKey) {
        // The admin kill switch for a gateway outage or fraud spike; plans already bought keep working.
        if (!platformSettings.subscriptionPlansEnabled()) {
            throw new ForbiddenException(ErrorCodes.PURCHASES_PAUSED,
                    "Plan purchases are paused for a short while. Please try again later.");
        }
        String key = blankToNull(idempotencyKey);
        Opened opened = transactions.execute(tx -> open(caller, body, key));

        if (opened.settled() != null) {

            return opened.settled();
        }

        PaymentGateway.PaymentOrder order;
        try {
            order = createOrder(opened);
            return transactions.execute(tx -> attach(opened.subscriptionId(), order));
        } catch (RuntimeException checkoutFailed) {

            abandon(opened);
            throw checkoutFailed;
        }
    }

    private Opened open(AuthPrincipal caller, SubscribeRequest body, String key) {
        if (key != null) {
            Optional<Subscription> replay =
                    subscriptions.findByUserIdAndIdempotencyKey(caller.userId(), key);
            if (replay.isPresent()) {
                Subscription existing = replay.get();
                if (SubscriptionStatuses.PENDING.equals(existing.getStatus()) && existing.getPaymentRef() != null) {
                    String sessionId = gateway.resumeSession(existing.getPaymentRef()).orElse(null);
                    return Opened.settled(mapper.toDto(existing).withPaymentSessionId(sessionId));
                }
                return Opened.settled(mapper.toDto(existing));
            }
        }

        Plan plan = Ids.parseUuid(body.planId())
                .flatMap(plans::findById)
                .filter(Plan::isActive)
                .orElseThrow(() -> NotFoundException.of("Plan"));
        UUID propertyId = Plan.KIND_LISTING_PASS.equals(plan.getKind())
                ? passes.requireBuyable(caller.userId(), body.propertyId())
                : null;

        Instant now = Instant.now();
        long price = mapper.price(plan);
        boolean free = price <= 0;

        if (!free) {
            Instant cutoff = ttl.cutoffFrom(now);
            List<Subscription> pending = subscriptions.findByUserIdOrderByStartedAtDesc(caller.userId()).stream()
                    .filter(s -> SubscriptionStatuses.PENDING.equals(s.getStatus()))
                    .toList();
            for (Subscription s : pending) {
                if (s.getCreatedAt() != null && s.getCreatedAt().isBefore(cutoff)) {
                    s.abandonCheckout();
                    subscriptions.saveAndFlush(s);
                }
            }
            long openUnpaid = subscriptions.countByUserIdAndStatus(
                    caller.userId(), SubscriptionStatuses.PENDING);
            if (openUnpaid >= MAX_OPEN_UNPAID_PER_USER) {
                throw openUnpaidConflict();
            }
        }

        Subscription subscription = new Subscription(
                caller.userId(),
                plan.getId(),
                propertyId,
                free ? SubscriptionStatuses.ACTIVE : SubscriptionStatuses.PENDING,
                price,
                now,
                free ? renewalFrom(now, plan.getTermDays(), plan.getBillingCycle()) : null,
                null,
                key);
        Subscription saved;
        try {
            saved = subscriptions.saveAndFlush(subscription);
        } catch (DataIntegrityViolationException violation) {

            // Other constraint failures stay generic so only the open-order cap gets this 409.
            if (isOpenUnpaidCollision(violation)) {
                log.info("Concurrent subscribe lost the open-unpaid race for {}", caller.userId());
                throw openUnpaidConflict();
            }
            throw violation;
        }
        if (free) {
            return Opened.settled(mapper.toDto(saved));
        }

        // why here: this is the last transaction that will be open, and the gateway call must not
        // hold a connection while it waits on the network.
        String phone = users.findById(caller.userId()).map(User::getMobile).orElse(null);

        // Use the saved amount so the gateway order and later ledger report one number.
        return new Opened(null, saved.getId(), saved.getAmount(),
                "subscription:" + caller.userId() + ":" + plan.getId()
                        + (propertyId == null ? "" : ":" + propertyId),
                new PaymentGateway.Customer(caller.userId().toString(), phone));
    }

    private SubscriptionDto attach(UUID subscriptionId, PaymentGateway.PaymentOrder order) {
        Subscription subscription = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new IllegalStateException("Subscription " + subscriptionId
                        + " disappeared before gateway order " + order.orderId()
                        + " could be attached"));
        if (!subscription.attachOrder(order.orderId())) {
            log.error("Subscription {} would not take gateway order {}; it is {} with ref {}",
                    subscriptionId, order.orderId(), subscription.getStatus(),
                    subscription.getPaymentRef());
        }
        Subscription saved = subscriptions.saveAndFlush(subscription);

        return mapper.toDto(saved).withPaymentSessionId(order.paymentSessionId());
    }

    // Compensating write for a gateway that refused the order after the row was committed.
    private void abandon(Opened opened) {
        try {
            transactions.executeWithoutResult(tx -> subscriptions.findById(opened.subscriptionId())
                    .ifPresent(Subscription::abandonUnopened));
            log.error("No gateway order for subscription {} ({}); cancelled it and released the "
                    + "idempotency key. Nothing was charged.",
                    opened.subscriptionId(), opened.reference());
        } catch (RuntimeException compensationFailed) {
            log.error("Could not cancel subscription {} after its gateway order failed; it will sit "
                    + "pending with an idempotency key that replays this dead row",
                    opened.subscriptionId(), compensationFailed);
        }
    }

    private record Opened(SubscriptionDto settled, UUID subscriptionId, long price,
            String reference, PaymentGateway.Customer customer) {

        static Opened settled(SubscriptionDto dto) {
            return new Opened(dto, null, 0, null, null);
        }
    }

    @Transactional
    public boolean applyRefundWebhook(String refundId, String status, String gatewayRef) {
        return passes.applyRefundWebhook(refundId, status, gatewayRef);
    }

    @Transactional
    public boolean applyWebhookOutcome(String orderId, boolean paid, Instant paidAt, BigDecimal paidAmount,
            String currency) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        Optional<Subscription> found = subscriptions.findByPaymentRef(orderId);
        if (found.isEmpty()) {
            return false;
        }
        Subscription subscription = found.get();
        if (subscription.getPropertyId() != null) {
            passes.lock(subscription);
        }
        if (paid && !SubscriptionStatuses.isEntitling(subscription.getStatus())
                && passes.refundIfMismatched(subscription, paidAt, paidAmount, currency)) {
            return true;
        }
        // A paid callback can land after the user cancelled or the sweep closed the order; the invoice check keeps
        // a replay after a lost dispute (also cancelled) from paying out twice.
        if (paid && passes.isDead(subscription)
                && !invoices.issued(Invoices.SUBSCRIPTION, subscription.getId())) {
            passes.refund(subscription, paidAt);
            return true;
        }
        if (!paid) {
            if (subscription.fail()) {
                log.info("Subscription {} cancelled: payment failed", subscription.getId());
            }
            return true;
        }
        Optional<Plan> plan = plans.findById(subscription.getPlanId());
        Instant renewal;
        if (plan.isEmpty()) {

            log.warn("Plan {} not found while settling subscription {}; granting the default "
                    + "{}-month term instead of the purchased one",
                    subscription.getPlanId(), subscription.getId(), YEARLY);
            renewal = renewalFrom(paidAt, null, null);
        } else {
            Plan bought = plan.get();
            if (bought.getTermDays() == null && monthsIn(bought.getBillingCycle()) == YEARLY
                    && !"yearly".equals(bought.getBillingCycle())) {
                log.warn("Plan {} has billing cycle {} which is not one of monthly/quarterly/yearly; "
                        + "granting {} months on subscription {}",
                        subscription.getPlanId(), bought.getBillingCycle(), YEARLY, subscription.getId());
            }
            renewal = renewalFrom(paidAt, bought.getTermDays(), bought.getBillingCycle());
        }
        if (!subscription.activate(paidAt, renewal)) {
            reportRefusedSettlement(subscription);
            return true;
        }
        if (subscription.getPropertyId() != null) {
            passes.resumeIfPaused(subscription);
        }
        invoices.issue(subscription.getUserId(), Invoices.SUBSCRIPTION, subscription.getId(),
                subscription.getPaymentRef(), subscription.getAmount(), subscription.getAmount(), paidAt);
        log.info("Subscription {} activated by provider callback", subscription.getId());
        return true;
    }

    private void reportRefusedSettlement(Subscription subscription) {
        if (SubscriptionStatuses.isEntitling(subscription.getStatus())) {
            log.info("Ignored payment callback for subscription {}: already {}",
                    subscription.getId(), subscription.getStatus());
            return;
        }
        log.error("Payment settled for subscription {} but it is {} — the customer has been charged "
                + "and holds no plan. Gateway order {}, user {}. Refund or reconcile.",
                subscription.getId(), subscription.getStatus(), subscription.getPaymentRef(),
                subscription.getUserId());
    }

    private ConflictException openUnpaidConflict() {
        return new ConflictException(ErrorCodes.ORDER_ALREADY_OPEN,
                "You already have a subscription order waiting for payment. "
                + "Finish paying for it, or wait for it to expire — an unpaid order is cancelled "
                + "automatically once its checkout has run out.");
    }

    // Match only the cap index; other insert failures must not masquerade as business rules.
    // A generic constraint failure is safer than saying the user already has an unpaid order.
    private static boolean isOpenUnpaidCollision(DataIntegrityViolationException violation) {
        return ConstraintViolations.isOn(violation, OPEN_UNPAID_INDEX);
    }

    // Standing may include pending orders; entitlement answers only what is usable now.
    // Only the retired subscription tiers count: passes and packs are priced by their own readers.
    @Transactional(readOnly = true)
    public Optional<Plan> entitlingPlan(UUID userId) {
        Instant now = Instant.now();
        return subscriptions.findByUserIdOrderByStartedAtDesc(userId).stream()
                .filter(s -> SubscriptionStatuses.isEntitling(s.getStatus()) && !s.hasLapsed(now))
                .flatMap(s -> plans.findById(s.getPlanId()).stream())
                .filter(p -> Plan.KIND_PLAN.equals(p.getKind()))
                .findFirst();
    }

    /** The caller's unexpired listing passes, soonest to lapse first. */
    @Transactional(readOnly = true)
    public List<Subscription> listingPasses(UUID userId) {
        return subscriptions.findEntitlingPasses(userId, SubscriptionStatuses.ENTITLED, Instant.now());
    }

    @Transactional(readOnly = true)
    public List<ContactPackTerm> contactPacks(UUID userId) {
        return subscriptions.findContactPackTerms(userId);
    }

    private Optional<Subscription> currentFor(UUID userId) {
        Instant now = Instant.now();
        List<Subscription> live = subscriptions.findByUserIdOrderByStartedAtDesc(userId).stream()
                .filter(s -> SubscriptionStatuses.isLive(s.getStatus()) && !s.hasLapsed(now))
                .toList();
        return live.stream()
                .filter(s -> SubscriptionStatuses.isEntitling(s.getStatus()))
                .findFirst()
                .or(() -> live.stream().findFirst());
    }

    private PaymentGateway.PaymentOrder createOrder(Opened opened) {
        PaymentGateway.PaymentOrder order =
                gateway.createOrder(opened.price(), opened.reference(), opened.customer());
        if (order.orderId() == null || order.orderId().isBlank()) {
            throw new IllegalStateException("Payment gateway returned no order id");
        }
        return order;
    }

    private static Instant renewalFrom(Instant from, Integer termDays, String billingCycle) {
        ZonedDateTime start = from.atZone(TERM_ZONE);
        return (termDays != null ? start.plusDays(termDays) : start.plusMonths(monthsIn(billingCycle)))
                .toInstant();
    }

    private static int monthsIn(String billingCycle) {
        if ("monthly".equals(billingCycle)) {
            return MONTHLY;
        }
        if ("quarterly".equals(billingCycle)) {
            return QUARTERLY;
        }

        return YEARLY;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
