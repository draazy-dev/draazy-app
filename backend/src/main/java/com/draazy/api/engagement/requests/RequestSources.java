package com.draazy.api.engagement.requests;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.RequestSource;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
class RequestSources {

    private final Map<String, RequestSource> byKind;

    RequestSources(List<RequestSource> sources) {
        this.byKind = sources.stream().collect(Collectors.toUnmodifiableMap(RequestSource::kind, Function.identity()));
    }

    List<RequestSource> all() {
        return List.copyOf(byKind.values());
    }

    RequestSource of(String kind) {
        RequestSource source = byKind.get(kind);
        if (source == null) {
            throw NotFoundException.of("Request");
        }
        return source;
    }
}
