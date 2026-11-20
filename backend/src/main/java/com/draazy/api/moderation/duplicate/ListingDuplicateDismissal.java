package com.draazy.api.moderation.duplicate;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "listing_duplicate_dismissals")
@Getter
public class ListingDuplicateDismissal extends BaseEntity {
    @Column(name = "cluster_signature", nullable = false, updatable = false)
    private String clusterSignature;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "member_ids", nullable = false, updatable = false, columnDefinition = "jsonb")
    private List<String> memberIds;

    @Column(name = "dismissed_by", nullable = false, updatable = false)
    private UUID dismissedBy;

    protected ListingDuplicateDismissal() {
    }

    public ListingDuplicateDismissal(String clusterSignature, List<String> memberIds,
            UUID dismissedBy) {
        this.clusterSignature = clusterSignature;
        this.memberIds = memberIds;
        this.dismissedBy = dismissedBy;
    }
}
