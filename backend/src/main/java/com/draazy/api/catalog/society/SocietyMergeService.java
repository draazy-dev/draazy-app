package com.draazy.api.catalog.society;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SocietyMergeService {
    private static final int NAMED_IN_REFUSAL = 3;

    private final SocietyRepository societies;
    private final AuditService audit;

    public SocietyMergeService(SocietyRepository societies, AuditService audit) {
        this.societies = societies;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Page<SocietyMergeResponse> list(Pageable pageable) {
        Page<Society> page = societies.merged(pageable);
        return page.map(this::describe);
    }

    public SocietyMergeResponse merge(SocietyMergeRequest request, AuthPrincipal operator) {
        Society loser = require(request.from());
        Society survivor = require(request.into());

        if (loser.getId().equals(survivor.getId())) {
            throw new ValidationException("A society cannot be merged into itself.");
        }

        if (survivor.getArchivedAt() != null) {
            throw new ConflictException(survivor.getName() + " has been retired from the catalogue. Merge into a live society.");
        }

        if (survivor.getMergedInto() != null) {
            Society real = SocietyMergePointer.survivor(societies, survivor);
            throw new ConflictException(survivor.getName() + " is itself merged into "
                    + real.getName() + " (" + real.getSlug() + "). Merge into that one instead.");
        }

        List<Society> absorbed = societies.findByMergedIntoOrderByMergedAtDesc(loser.getId());
        if (!absorbed.isEmpty()) {
            throw new ConflictException(loser.getName() + " already has " + absorbed.size()
                    + " society(s) merged into it (" + namesOf(absorbed)
                    + "). Undo those merges before merging it away.");
        }

        if (societies.recordMerge(loser.getId(), survivor.getId(), operator.userId()) == 0) {
            Society current = SocietyMergePointer.survivor(societies, require(request.from()));
            throw new ConflictException(loser.getName() + " has already been merged into "
                    + current.getName() + " (" + current.getSlug() + ").");
        }

        audit.record(operator, "society.merge", "society", loser.getSlug(),
                "into", survivor.getSlug(),
                "name", loser.getName(),
                "intoName", survivor.getName());

        return new SocietyMergeResponse(loser.getSlug(), loser.getName(),
                survivor.getSlug(), survivor.getName(), java.time.Instant.now());
    }

    public void undo(String slug, AuthPrincipal operator) {
        Society loser = require(slug);
        if (loser.getMergedInto() == null) {
            throw NotFoundException.of("Merge");
        }
        Society survivor = SocietyMergePointer.survivor(societies, loser);

        if (societies.undoMerge(loser.getId()) == 0) {
            return;
        }

        audit.record(operator, "society.unmerge", "society", loser.getSlug(),
                "wasMergedInto", survivor.getSlug(),
                "name", loser.getName());
    }

    private Society require(String slug) {
        return societies.findBySlug(slug == null ? null : slug.trim())
                .orElseThrow(() -> NotFoundException.of("Society"));
    }

    private SocietyMergeResponse describe(Society merged) {
        Society survivor = SocietyMergePointer.survivor(societies, merged);
        return new SocietyMergeResponse(merged.getSlug(), merged.getName(),
                survivor.getSlug(), survivor.getName(), merged.getMergedAt());
    }

    private static String namesOf(List<Society> rows) {
        String named = rows.stream().limit(NAMED_IN_REFUSAL)
                .map(s -> s.getName() + " (" + s.getSlug() + ")")
                .collect(Collectors.joining(", "));
        int rest = rows.size() - Math.min(rows.size(), NAMED_IN_REFUSAL);
        return rest == 0 ? named : named + " and " + rest + " more";
    }
}
