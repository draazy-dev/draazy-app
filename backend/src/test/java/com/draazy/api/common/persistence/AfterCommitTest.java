package com.draazy.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

class AfterCommitTest {

    private final TransactionTemplate transactions = new TransactionTemplate(new NoOpTransactionManager());

    @Test
    void runsAtOnceWithoutATransaction() {
        AtomicInteger fired = new AtomicInteger();
        AfterCommit.run(fired::incrementAndGet);
        assertThat(fired).hasValue(1);
    }

    @Test
    void waitsForTheCommit() {
        AtomicInteger fired = new AtomicInteger();
        transactions.executeWithoutResult(status -> {
            AfterCommit.run(fired::incrementAndGet);
            assertThat(fired).hasValue(0);
        });
        assertThat(fired).hasValue(1);
    }

    @Test
    void dropsTheActionOnRollback() {
        AtomicInteger fired = new AtomicInteger();
        transactions.executeWithoutResult(status -> {
            AfterCommit.run(fired::incrementAndGet);
            status.setRollbackOnly();
        });
        assertThat(fired).hasValue(0);
    }

    private static final class NoOpTransactionManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}