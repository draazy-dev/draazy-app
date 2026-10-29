package com.draazy.api.security;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RateLimitStoreConfig {
    static final String MEMORY = "memory";
    static final String REDIS = "redis";

    @Bean
    public WriteRateLimitStore.Factory writeRateLimitStores(
            @Value("${draazy.ratelimit.store:" + MEMORY + "}") String store,
            ObjectProvider<RedisEval> redisEvals) {
        return storeFactory(store, redisEvals.getIfAvailable());
    }

    static WriteRateLimitStore.Factory storeFactory(String store, RedisEval redisEval) {
        String choice = store == null ? MEMORY : store.trim().toLowerCase(java.util.Locale.ROOT);
        if (MEMORY.equals(choice)) {
            return InMemoryWriteRateLimitStore::new;
        }
        if (REDIS.equals(choice)) {
            if (redisEval == null) {
                throw new IllegalStateException(
                        "draazy.ratelimit.store=redis but no RedisEval bean is available. A Redis "
                                + "client cannot currently be added to this build offline (see "
                                + "RedisEval for the dependency detail), so the shared-counter store "
                                + "has no transport yet. Use draazy.ratelimit.store=memory until "
                                + "one is wired.");
            }
            return (namespace, budget, window) ->
                    new RedisWriteRateLimitStore(redisEval, namespace, budget, window);
        }
        throw new IllegalArgumentException(
                "draazy.ratelimit.store must be '" + MEMORY + "' or '" + REDIS + "', got: " + store);
    }
}
