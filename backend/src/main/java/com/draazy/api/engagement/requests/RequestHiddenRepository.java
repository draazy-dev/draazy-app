package com.draazy.api.engagement.requests;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RequestHiddenRepository extends JpaRepository<RequestHidden, RequestHiddenKey> {

    @Query("select h from RequestHidden h where h.id.userId = :userId")
    List<RequestHidden> findByUser(@Param("userId") UUID userId);
}
