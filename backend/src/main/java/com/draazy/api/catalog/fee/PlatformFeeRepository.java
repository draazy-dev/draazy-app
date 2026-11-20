package com.draazy.api.catalog.fee;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformFeeRepository extends JpaRepository<PlatformFee, String> {
    List<PlatformFee> findAllByOrderByDealAsc();
}
