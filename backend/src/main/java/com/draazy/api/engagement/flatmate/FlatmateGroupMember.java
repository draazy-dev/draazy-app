package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "flatmate_group_members")
@Getter
public class FlatmateGroupMember extends AuditedEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false, updatable = false)
    private FlatmateGroup group;

    @Column(name = "user_id")
    @Setter
    private UUID userId;

    @Column(name = "name")
    @Setter
    private String name;

    @Column(name = "initials")
    @Setter
    private String initials;

    @Column(name = "verified", nullable = false)
    @Setter
    private boolean verified = false;

    protected FlatmateGroupMember() {
    }

    FlatmateGroupMember(String name, UUID userId, boolean verified) {
        this.name = name;
        this.userId = userId;
        this.verified = verified;
        this.initials = initialsOf(name);
    }

    void attachTo(FlatmateGroup owner) {
        this.group = owner;
    }

    static String initialsOf(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String[] words = name.strip().split("\\s+");
        StringBuilder out = new StringBuilder(2);
        for (String word : words) {
            if (out.length() == 2) {
                break;
            }
            if (!word.isEmpty()) {
                out.append(Character.toUpperCase(word.charAt(0)));
            }
        }
        return out.isEmpty() ? null : out.toString();
    }
}
