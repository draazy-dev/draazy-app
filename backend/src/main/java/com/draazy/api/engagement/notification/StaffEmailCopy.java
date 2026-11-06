package com.draazy.api.engagement.notification;

import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.EmailSender;
import jakarta.annotation.PreDestroy;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class StaffEmailCopy {
    private static final Logger log = LoggerFactory.getLogger(StaffEmailCopy.class);
    private static final int MAX_PENDING = 500;

    private final UserRepository users;
    private final EmailSender email;
    private final String baseUrl;
    private final Executor sender;

    // Off the request thread: a customer's action that alerts staff must not wait on the mail provider.
    @Autowired
    StaffEmailCopy(UserRepository users, EmailSender email, @Value("${draazy.app.base-url}") String baseUrl) {
        this(users, email, baseUrl, new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(MAX_PENDING), Thread.ofPlatform().daemon().name("staff-email").factory(),
                (task, pool) -> log.warn("Staff alert email queue is full; an email was dropped")));
    }

    StaffEmailCopy(UserRepository users, EmailSender email, String baseUrl, Executor sender) {
        this.users = users;
        this.email = email;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.sender = sender;
    }

    @PreDestroy
    void drain() throws InterruptedException {
        if (sender instanceof ExecutorService pool) {
            pool.shutdown();
            pool.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    void send(UUID userId, String title, String body, String link) {
        users.findLiveStaffEmail(userId).ifPresent(to -> {
            StringBuilder text = new StringBuilder(title).append("\n\n");
            if (body != null && !body.isBlank()) {
                text.append(body).append("\n\n");
            }
            if (link != null && !link.isBlank()) {
                text.append("Open it in the back office: ").append(baseUrl).append(link).append("\n\n");
            }
            text.append("You get this because you work in the Draazy back office.\n");
            String subject = "Draazy: " + title;
            AfterCommit.run(() -> sender.execute(() -> deliver(to, subject, text.toString())));
        });
    }

    private void deliver(String to, String subject, String text) {
        try {
            email.send(to, subject, text);
        } catch (RuntimeException e) {
            log.warn("Staff alert email to {} failed: {}", EmailSender.maskAddress(to), e.toString());
        }
    }
}
