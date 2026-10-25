package com.draazy.api.jobs;

import static com.draazy.api.jobs.ScheduledJob.Group.DAYTIME;
import static com.draazy.api.jobs.ScheduledJob.Group.FREQUENT;
import static com.draazy.api.jobs.ScheduledJob.Group.HOURLY;
import static com.draazy.api.jobs.ScheduledJob.Group.NIGHTLY;

import com.draazy.api.admin.alerts.StaffSlaSweep;
import com.draazy.api.billing.plan.SubscriptionSweeper;
import com.draazy.api.billing.referral.ReferralHoldSweep;
import com.draazy.api.billing.referral.ReferralSignalRetention;
import com.draazy.api.catalog.listing.ListingContentPurge;
import com.draazy.api.catalog.listing.ListingDuplicateSweep;
import com.draazy.api.catalog.managed.TrackedRentService;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.audit.AuditLogRetention;
import com.draazy.api.common.log.ErrorEventRetention;
import com.draazy.api.common.payments.AbandonedCheckoutSweep;
import com.draazy.api.documents.agreement.RentAgreementRenewalSweeper;
import com.draazy.api.engagement.flatmate.FlatmateExpiryService;
import com.draazy.api.engagement.flatmate.FlatmateOwnerNoticeService;
import com.draazy.api.engagement.flatmate.FlatmateTrustReconciler;
import com.draazy.api.engagement.notification.NotificationRetention;
import com.draazy.api.engagement.notification.WaitingDigestService;
import com.draazy.api.engagement.pageview.PageViewRetention;
import com.draazy.api.engagement.pageview.PageViewRollup;
import com.draazy.api.engagement.search.SavedSearchService;
import com.draazy.api.identity.auth.RefreshTokenService;
import com.draazy.api.identity.verification.IdentityConflictService;
import com.draazy.api.identity.verification.IdentityFilePurgeService;
import com.draazy.api.identity.verification.IdentityVerificationService;
import com.draazy.api.leads.contact.ContactReturns;
import com.draazy.api.moderation.verification.NeedsInfoSweepService;
import com.draazy.api.provider.ProviderCalls;
import com.draazy.api.services.request.CoFillInviteRetention;
import com.draazy.api.services.request.ServiceRequestIdentityRetention;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Every scheduled job, its group, and the name behind its {@code draazy.jobs.<name>.enabled} flag. */
@Configuration
class JobCatalog {

    private static final int MAX_PAGES = 10;

    // These read one capped page per call, sized for hourly runs; a daily run repeats until a page comes back empty.
    static LongSupplier drain(LongSupplier page) {
        return () -> {
            long total = 0;
            for (int i = 0; i < MAX_PAGES; i++) {
                long touched = page.getAsLong();
                if (touched == 0) {
                    break;
                }
                total += touched;
            }
            return total;
        };
    }

    @Bean
    ScheduledJob abandonedCheckoutsJob(AbandonedCheckoutSweep sweep) {
        return new ScheduledJob("abandoned-checkouts", FREQUENT, sweep::expireAbandonedCheckouts);
    }

    @Bean
    ScheduledJob passRefundsJob(SubscriptionSweeper subscriptions) {
        return new ScheduledJob("pass-refunds", FREQUENT, subscriptions::sendDueRefunds);
    }

    @Bean
    ScheduledJob listingDuplicatesJob(ListingDuplicateSweep sweep) {
        return new ScheduledJob("listing-duplicates", FREQUENT, sweep::resweepRecentListings);
    }

    @Bean
    ScheduledJob staffSlaJob(StaffSlaSweep sweep) {
        return new ScheduledJob("staff-sla", FREQUENT, sweep::sweepNow);
    }

    @Bean
    ScheduledJob subscriptionExpiryJob(SubscriptionSweeper subscriptions) {
        return new ScheduledJob("subscription-expiry", HOURLY, () -> subscriptions.expireLapsed(Instant.now()));
    }

    @Bean
    ScheduledJob savedSearchCountsJob(SavedSearchService savedSearches) {
        return new ScheduledJob("saved-search-counts", HOURLY, () -> savedSearches.recomputeNewCounts(Instant.now()));
    }

    @Bean
    ScheduledJob pageViewRollupJob(PageViewRollup rollup) {
        return new ScheduledJob("page-view-rollup", HOURLY, rollup::rollUpNow);
    }

    @Bean
    ScheduledJob refreshTokensJob(RefreshTokenService refreshTokens) {
        return new ScheduledJob("refresh-tokens", NIGHTLY, () -> refreshTokens.pruneExpired(Instant.now()));
    }

    @Bean
    ScheduledJob referralSignalRetentionJob(ReferralSignalRetention retention) {
        return new ScheduledJob("referral-signal-retention", NIGHTLY, retention::expireNow);
    }

    @Bean
    ScheduledJob coFillInviteRetentionJob(CoFillInviteRetention retention) {
        return new ScheduledJob("co-fill-invite-retention", NIGHTLY, retention::expireNow);
    }

    @Bean
    ScheduledJob serviceRequestIdentityRetentionJob(ServiceRequestIdentityRetention retention) {
        return new ScheduledJob("service-request-identity-retention", NIGHTLY, retention::purgeNow);
    }

    @Bean
    ScheduledJob notificationRetentionJob(NotificationRetention retention) {
        return new ScheduledJob("notification-retention", NIGHTLY, retention::purgeNow);
    }

    @Bean
    ScheduledJob pageViewRetentionJob(PageViewRetention retention) {
        return new ScheduledJob("page-view-retention", NIGHTLY, retention::expireNow);
    }

    @Bean
    ScheduledJob errorEventRetentionJob(ErrorEventRetention retention) {
        return new ScheduledJob("error-event-retention", NIGHTLY, retention::purgeNow);
    }

    @Bean
    ScheduledJob auditLogRetentionJob(AuditLogRetention retention) {
        return new ScheduledJob("audit-log-retention", NIGHTLY, retention::purgeNow);
    }

    @Bean
    ScheduledJob providerCallRetentionJob(ProviderCalls calls) {
        return new ScheduledJob("provider-call-retention", NIGHTLY, calls::purgeExpired);
    }

    @Bean
    ScheduledJob listingContentPurgeJob(ListingContentPurge purge) {
        return new ScheduledJob("listing-content-purge", NIGHTLY, drain(() -> purge.purgeDue(Instant.now())));
    }

    @Bean
    ScheduledJob flatmateOwnerNoticePurgeJob(FlatmateOwnerNoticeService notices) {
        return new ScheduledJob("flatmate-owner-notice-purge", NIGHTLY, notices::purgeExpired);
    }

    @Bean
    ScheduledJob identityImagePurgeJob(IdentityVerificationService identity,
            @Value("${draazy.identity.image-retention-days:7}") int retentionDays) {
        return new ScheduledJob("identity-image-purge", NIGHTLY, drain(() -> identity.purgeExpiredFiles(retentionDays)));
    }

    // Not drained: a failing delete stays due, so a second page would retry it in the same run.
    @Bean
    ScheduledJob identityDeleteRetryJob(IdentityFilePurgeService filePurge) {
        return new ScheduledJob("identity-delete-retry", NIGHTLY,
                () -> filePurge.retryQueuedDeletes(Instant.now(), 2000));
    }

    @Bean
    ScheduledJob identityConflictRetentionJob(IdentityConflictService conflicts) {
        return new ScheduledJob("identity-conflict-retention", NIGHTLY,
                () -> conflicts.deleteOlderThan(Duration.ofDays(30)));
    }

    @Bean
    ScheduledJob identityPendingExpiryJob(IdentityVerificationService identity,
            @Value("${draazy.identity.pending-ttl:P14D}") Duration pendingTtl) {
        return new ScheduledJob("identity-pending-expiry", DAYTIME, drain(() -> identity.expireStalePending(pendingTtl)));
    }

    @Bean
    ScheduledJob contactReturnsJob(ContactReturns returns) {
        return new ScheduledJob("contact-returns", DAYTIME, drain(() -> returns.expireOverdue(Instant.now())));
    }

    @Bean
    ScheduledJob referralHoldsJob(ReferralHoldSweep sweep) {
        LongSupplier release = drain(sweep::releaseDue);
        return new ScheduledJob("referral-holds", DAYTIME, () -> {
            long released = release.getAsLong();
            sweep.recheckGranted();
            return released;
        });
    }

    @Bean
    ScheduledJob needsInfoJob(NeedsInfoSweepService needsInfo) {
        return new ScheduledJob("needs-info", DAYTIME, drain(() -> {
            NeedsInfoSweepService.SweepResult result = needsInfo.sweep();
            return result.reminded() + result.archived();
        }));
    }

    @Bean
    ScheduledJob flatmateOwnerTierJob(FlatmateTrustReconciler reconciler) {
        return new ScheduledJob("flatmate-owner-tier", DAYTIME, reconciler::reconcileOwnerTier);
    }

    @Bean
    ScheduledJob flatmateAgreementExpiryJob(FlatmateTrustReconciler reconciler) {
        return new ScheduledJob("flatmate-agreement-expiry", DAYTIME, reconciler::reconcileAgreementExpiry);
    }

    @Bean
    ScheduledJob flatmateDraazyAgreementsJob(FlatmateTrustReconciler reconciler) {
        return new ScheduledJob("flatmate-draazy-agreements", DAYTIME, reconciler::reconcileDraazyAgreements);
    }

    @Bean
    ScheduledJob flatmatePostRemindersJob(FlatmateExpiryService expiry) {
        return new ScheduledJob("flatmate-post-reminders", DAYTIME, expiry::remindExpiring);
    }

    // Hourly because public reads don't check active_until: a lapsed post stays on the board until this runs.
    @Bean
    ScheduledJob flatmatePostExpiryJob(FlatmateExpiryService expiry) {
        return new ScheduledJob("flatmate-post-expiry", HOURLY, expiry::expireLapsed);
    }

    @Bean
    ScheduledJob renewalRemindersJob(RentAgreementRenewalSweeper renewals) {
        return new ScheduledJob("renewal-reminders", DAYTIME, () -> renewals.remindEnding(Instant.now()));
    }

    @Bean
    ScheduledJob trackedRentRemindersJob(TrackedRentService rent) {
        return new ScheduledJob("tracked-rent-reminders", DAYTIME, () -> rent.remindDue(LocalDate.now(PlatformTime.IST)));
    }

    @Bean
    ScheduledJob waitingDigestJob(WaitingDigestService digest) {
        return new ScheduledJob("waiting-digest", DAYTIME, () -> digest.sendDue(Instant.now()));
    }
}
