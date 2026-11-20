package com.draazy.api.engagement.messaging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, String> {
    List<MessageTemplate> findByChannelAndActiveTrueOrderByCategoryAscNameAsc(String channel);
}
