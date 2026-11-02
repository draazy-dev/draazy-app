package com.draazy.api.provider.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.exception.SdkClientException;

class R2FileStorageTimeoutTest {
    private ServerSocket silent;
    private final List<Socket> held = new CopyOnWriteArrayList<>();

    @BeforeEach
    void acceptButNeverAnswer() throws Exception {
        silent = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        Thread.ofVirtual().start(() -> {
            while (!silent.isClosed()) {
                try {
                    held.add(silent.accept());
                } catch (Exception closed) {
                    return;
                }
            }
        });
    }

    @AfterEach
    void close() throws Exception {
        silent.close();
        for (Socket s : held) s.close();
    }

    @Test
    void aStalledStorageCallFailsWithinTheCallBudget() {
        R2FileStorage storage = new R2FileStorage(props(), Duration.ofMillis(300), Duration.ofMillis(800));
        byte[] body = "x".getBytes(StandardCharsets.UTF_8);
        long started = System.nanoTime();
        try {
            assertThatThrownBy(() -> storage.storePublic("k.jpg", body, "image/jpeg"))
                    .isInstanceOf(SdkClientException.class);
        } finally {
            storage.destroy();
        }
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(5));
    }

    private R2Properties props() {
        return new R2Properties(true, "http://127.0.0.1:" + silent.getLocalPort(),
                "id", "secret", "public", "private", "https://cdn.example");
    }
}
