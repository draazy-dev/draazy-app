package com.draazy.api.common.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;

@MappedSuperclass
public abstract class VersionedEntity extends AuditedEntity {
    @Version
    @Column(name = "version", nullable = false)
    private long version;
}
