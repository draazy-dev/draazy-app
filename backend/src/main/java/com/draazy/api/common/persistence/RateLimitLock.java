package com.draazy.api.common.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.FlushModeType;
import jakarta.persistence.Query;
import java.util.Objects;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class RateLimitLock {
    public enum Limit {
        OTP_SEND(1),

        FLATMATE_INTEREST(3),

        SERVICE_WAITLIST(4),

        OTP_SEND_CALLER(5),

        LISTING_CREATE(6),

        CONTACT_REQUEST(7),

        FLATMATE_LISTING_DECISION(8),

        LISTING_LIVE(9),

        REFERRER_QUALIFY(10),

        REPORT_CREATE(11),

        REQUEST_REMINDER(12),

        PHOTO_UPLOAD(13),

        OWNER_NOTICE(14),

        LEAD_CLAIM(15),

        REFERRAL_INVITER(16),

        REFERRAL_INVITE_MOBILE(17);

        private final int namespace;

        Limit(int namespace) {
            this.namespace = namespace;
        }
    }

    private final EntityManager em;

    public RateLimitLock(EntityManager em) {
        this.em = em;
    }

    // Take before reading the count it guards, with the insert in the same transaction;
    // either half missing guards nothing.
    public void holdUntilCommit(Limit limit, String key) {
        acquire(limit, key, "select 1 from (select pg_advisory_xact_lock(:lockId)) as acquired");
    }

    public boolean tryHoldUntilCommit(Limit limit, String key) {
        return Boolean.TRUE.equals(
                acquire(limit, key, "select pg_try_advisory_xact_lock(:lockId)"));
    }

    private Object acquire(Limit limit, String key, String sql) {
        require(limit, key);
        Query query = em.createNativeQuery(sql);

        query.setFlushMode(FlushModeType.COMMIT);
        query.setParameter("lockId", lockId(limit, key));
        return query.getSingleResult();
    }

    private static void require(Limit limit, String key) {
        Objects.requireNonNull(limit, "limit");
        Objects.requireNonNull(key, "key");
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "RateLimitLock." + limit + " needs an active transaction — a transaction-scoped "
                            + "advisory lock taken outside one is released immediately and enforces "
                            + "nothing");
        }
    }

    static long lockId(Limit limit, String key) {
        return ((long) limit.namespace << 32) | (key.hashCode() & 0xFFFF_FFFFL);
    }
    }
