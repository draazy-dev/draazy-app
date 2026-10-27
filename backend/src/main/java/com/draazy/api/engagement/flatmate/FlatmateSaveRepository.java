package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** No entity: a composite PK serving one list, one insert and one hard delete. The bare {@link Repository}
 * marker keeps Spring Data from publishing {@code findAll()}/{@code delete()} against the users table. */
public interface FlatmateSaveRepository extends Repository<User, UUID> {

    interface SaveRow {
        String getKind();

        UUID getPostId();

        Instant getSavedAt();
    }

    /** Paged in SQL so the entity fetches only load one page; a native paged query needs its own count. */
    @Query(value = "select kind as kind, post_id as postId, created_at as savedAt from flatmate_saves"
            + " where user_id = :userId order by created_at desc, post_id",
            countQuery = "select count(*) from flatmate_saves where user_id = :userId",
            nativeQuery = true)
    Page<SaveRow> findSaves(@Param("userId") UUID userId, Pageable pageable);

    /** Unpaged: the board must know every save to draw any card's bookmark. */
    @Query(value = "select kind as kind, post_id as postId, created_at as savedAt from flatmate_saves"
            + " where user_id = :userId order by created_at desc, post_id",
            nativeQuery = true)
    List<SaveRow> findAllSaves(@Param("userId") UUID userId);

    /** Returns 1 if inserted, 0 if already present, so a repeat tap never throws. */
    @Modifying
    @Query(value = "insert into flatmate_saves (user_id, kind, post_id) values (:userId, :kind, :postId)"
            + " on conflict do nothing",
            nativeQuery = true)
    int insertIfAbsent(@Param("userId") UUID userId, @Param("kind") String kind,
            @Param("postId") UUID postId);

    /** 0 when nothing existed; the controller answers 204 either way. */
    @Modifying
    @Query(value = "delete from flatmate_saves where user_id = :userId and kind = :kind and post_id = :postId",
            nativeQuery = true)
    int delete(@Param("userId") UUID userId, @Param("kind") String kind,
            @Param("postId") UUID postId);
}
