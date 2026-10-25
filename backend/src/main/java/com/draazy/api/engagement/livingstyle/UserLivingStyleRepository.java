package com.draazy.api.engagement.livingstyle;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserLivingStyleRepository extends JpaRepository<UserLivingStyle, UUID> {
}
