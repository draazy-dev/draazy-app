package com.draazy.api.admin.staff;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffActivityService {
    private static final int LEADERBOARD_CAP = 24;

    private final StaffActivityRepository repository;

    StaffActivityService(StaffActivityRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Page<StaffActivityEntry> feed(StaffActivityFilter filter, Pageable pageable, boolean withMetadata) {
        long total = repository.total(filter);
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, 0);
        }
        List<StaffActivityEntry> rows = repository.feed(
                filter, pageable.getPageSize(), (int) pageable.getOffset(), withMetadata);
        return new PageImpl<>(rows, pageable, total);
    }

    @Transactional(readOnly = true)
    public StaffActivitySummary summary(StaffActivityFilter filter) {
        return new StaffActivitySummary(
                repository.total(filter),
                repository.distinctActors(filter),
                repository.byEntity(filter),
                repository.actions(filter),
                repository.leaderboard(filter, LEADERBOARD_CAP));
    }
}
