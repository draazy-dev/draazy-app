package com.draazy.api.catalog.city;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CityRepository extends JpaRepository<City, String> {
    List<City> findAllByOrderByLiveDescNameAsc();
}
