package com.draazy.api.security;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
public class RateLimitStoreConfig {
    static final String MEMORY = "memory";
    static final String REDIS = "redis";
    static final String POSTGRES_STORE = "postgres";

    @Bean
    public WriteRateLimitStore.Factory writeRateLimitStores(
            @Value("${draazy.ratelimit.store:" + MEMORY + "}") String store,
            ObjectProvider<RedisEval> redisEvals, JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager) {
        return storeFactory(store, redisEvals.getIfAvailable(), postgres(jdbc, transactionManager));
    }

    // REQUIRES_NEW: a caller's rollback must not refund the hit, nor hold the counter row lock until it commits.
    static WriteRateLimitStore.Factory postgres(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        TransactionTemplate ownTx = new TransactionTemplate(transactionManager);
        ownTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return (namespace, budget, window) ->
                new PostgresWriteRateLimitStore(jdbc, ownTx, namespace, budget, window);
    }

    static WriteRateLimitStore.Factory storeFactory(String store, RedisEval redisEval,
            WriteRateLimitStore.Factory postgres) {
        String choice = store == null ? MEMORY : store.trim().toLowerCase(java.util.Locale.ROOT);
        if (MEMORY.equals(choice)) {
            return InMemoryWriteRateLimitStore::new;
        }
        if (POSTGRES_STORE.equals(choice)) {
            return postgres;
        }
        if (REDIS.equals(choice)) {
            if (redisEval == null) {
                throw new IllegalStateException(
                        "draazy.ratelimit.store=redis but no RedisEval bean is available. A Redis "
                                + "client cannot currently be added to this build offline (see "
                                + "RedisEval for the dependency detail), so the shared-counter store "
                                + "has no transport yet. Use draazy.ratelimit.store=postgres until "
                                + "one is wired.");
            }
            return (namespace, budget, window) ->
                    new RedisWriteRateLimitStore(redisEval, namespace, budget, window);
        }
        throw new IllegalArgumentException("draazy.ratelimit.store must be '" + MEMORY + "', '" + POSTGRES_STORE
                + "' or '" + REDIS + "', got: " + store);
    }
}