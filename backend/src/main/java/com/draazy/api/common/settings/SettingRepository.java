package com.draazy.api.common.settings;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SettingRepository extends JpaRepository<Setting, String> {
    @Query(value = "select key, value::text from settings order by key", nativeQuery = true)
    List<Object[]> storedText();
}
