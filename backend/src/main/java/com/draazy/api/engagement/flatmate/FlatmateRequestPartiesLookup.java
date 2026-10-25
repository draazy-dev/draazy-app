package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.FlatmateRequestParties;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(readOnly = true)
class FlatmateRequestPartiesLookup implements FlatmateRequestParties {

    private final FlatmateRequestRepository requests;

    FlatmateRequestPartiesLookup(FlatmateRequestRepository requests) {
        this.requests = requests;
    }

    @Override
    public Optional<Pair> chattable(UUID requestId, UUID userId) {
        return requests.findById(requestId)
                .filter(r -> userId.equals(r.getRequesterId()) || userId.equals(r.getHostId()))
                .filter(r -> FlatmateVocabulary.STATUS_ACCEPTED.equals(r.getStatus())
                        || (r.isPending() && "group".equals(r.getKind()) && userId.equals(r.getHostId())))
                .map(r -> new Pair(userId.equals(r.getHostId()) ? r.getRequesterId() : r.getHostId(),
                        "flatmate".equals(r.getKind()) ? "post" : r.getKind(), r.getTargetId()));
    }
}
