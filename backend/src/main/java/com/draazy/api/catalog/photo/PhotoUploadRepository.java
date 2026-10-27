package com.draazy.api.catalog.photo;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

interface PhotoUploadRepository extends JpaRepository<PhotoUpload, String> {

    long countByUploaderIdAndCreatedAtAfter(UUID uploaderId, Instant since);

    List<PhotoUpload> findByCreatedAtBeforeOrderByCreatedAt(Instant cutoff, Limit limit);
}
