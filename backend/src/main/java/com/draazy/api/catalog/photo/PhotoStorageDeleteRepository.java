package com.draazy.api.catalog.photo;

import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface PhotoStorageDeleteRepository extends JpaRepository<PhotoStorageDelete, String> {

    @Modifying
    @Query(value = """
            insert into photo_storage_deletes (url, last_error) values (:url, :lastError)
            on conflict (url) do update set attempts = photo_storage_deletes.attempts + 1,
                                            last_error = excluded.last_error
            """, nativeQuery = true)
    void recordFailure(String url, String lastError);

    List<PhotoStorageDelete> findAllByAttemptsLessThanOrderByAttemptsAscQueuedAtAsc(int attempts, Limit limit);
}
