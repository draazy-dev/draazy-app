package com.draazy.api.engagement.livingstyle;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "user_living_style")
@Getter
public class UserLivingStyle {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answers", nullable = false)
    private Map<String, Integer> answers;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserLivingStyle() {
        // JPA
    }

    public UserLivingStyle(UUID userId, Map<String, Integer> answers) {
        this.userId = userId;
        replace(answers);
    }

    public void replace(Map<String, Integer> answers) {
        this.answers = Map.copyOf(answers);
        this.updatedAt = Instant.now();
    }
}
