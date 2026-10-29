package com.draazy.api.support;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntConsumer;

// Tests using this must be plain @SpringBootTest, not @Transactional (rollback hides races),
// and must delete their own rows, which are real.
public final class Races {
    private static final int TIMEOUT_SECONDS = 60;

    private Races() {
    }

    public static List<Throwable> run(int threads, IntConsumer task) {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CyclicBarrier gate = new CyclicBarrier(threads);
            List<Future<Throwable>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                int index = i;
                futures.add(pool.submit(() -> {
                    gate.await(TIMEOUT_SECONDS, TimeUnit.SECONDS);
                    try {
                        task.accept(index);
                        return null;
                    } catch (Throwable thrown) {
                        return thrown;
                    }
                }));
            }
            List<Throwable> outcomes = new ArrayList<>();
            for (Future<Throwable> future : futures) {
                try {
                    outcomes.add(future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS));
                } catch (Exception e) {
                    throw new IllegalStateException(
                            "a racing thread never finished — most likely a lock that is held "
                                    + "longer than the test expects, or a connection pool too small "
                                    + "for " + threads + " concurrent writers",
                            e);
                }
            }
            return outcomes;
        } finally {
            pool.shutdownNow();
        }
    }
}
