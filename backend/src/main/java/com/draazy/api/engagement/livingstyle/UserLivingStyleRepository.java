package com.draazy.api.engagement.livingstyle;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserLivingStyleRepository extends JpaRepository<UserLivingStyle, UUID> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into user_living_style (user_id, answers, updated_at)
            values (:userId, cast(:answers as jsonb), now())
            on conflict (user_id) do update set answers = excluded.answers, updated_at = excluded.updated_at
            """, nativeQuery = true)
    void upsert(UUID userId, String answers);
}
