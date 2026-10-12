package com.draazy.api.common.settings;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Reads {@link Setting} rows. Writes belong to the admin settings surface, which is not built yet. */
public interface SettingRepository extends JpaRepository<Setting, String> {

    /** Each row as {@code [key, value]} in jsonb's own rendering, which differs from the JSON written into it. */
    @Query(value = "select key, value::text from settings order by key", nativeQuery = true)
    List<Object[]> storedText();
}
