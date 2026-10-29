package com.draazy.api.catalog.property;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "property_photo_hashes")
@IdClass(PropertyPhotoHash.Key.class)
@Getter
@NoArgsConstructor
public class PropertyPhotoHash {
    @Id
    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "hash", nullable = false)
    private long hash;

    @Column(name = "band0", insertable = false, updatable = false)
    private int band0;

    @Column(name = "band1", insertable = false, updatable = false)
    private int band1;

    @Column(name = "band2", insertable = false, updatable = false)
    private int band2;

    @Column(name = "band3", insertable = false, updatable = false)
    private int band3;

    public PropertyPhotoHash(UUID propertyId, long hash) {
        this.propertyId = propertyId;
        this.hash = hash;
    }

    @NoArgsConstructor
    @Getter
    public static class Key implements Serializable {
        private UUID propertyId;
        private long hash;

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Key other)) {
                return false;
            }
            return hash == other.hash && Objects.equals(propertyId, other.propertyId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(propertyId, hash);
        }
    }
}
