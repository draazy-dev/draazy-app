package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class FlatmateInterestSource implements RequestSource {

    private final FlatmateRequestRepository requests;
    private final FlatmateRequestHydrator hydrator;
    private final UserRepository users;
    private final FlatmateSeekerService seeker;

    FlatmateInterestSource(FlatmateRequestRepository requests, FlatmateRequestHydrator hydrator,
            UserRepository users, FlatmateSeekerService seeker) {
        this.requests = requests;
        this.hydrator = hydrator;
        this.users = users;
        this.seeker = seeker;
    }

    @Override
    public String kind() {
        return "flatmate";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toViews(requests.findSentSince(requesterId, since), false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId, Instant since) {
        return toViews(requests.findReceivedSince(recipientId, since), true);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return requests.findByIdAndRequesterId(id, requesterId)
                .flatMap(row -> toViews(List.of(row), false).stream().findFirst());
    }

    @Override
    public void withdraw(UUID requesterId, UUID id) {
        requests.findByIdAndRequesterId(id, requesterId).ifPresent(row -> seeker.withdraw(
                new AuthPrincipal(requesterId, null, null, true, true), row.getKind(), row.getTargetId()));
    }

    private List<RequestView> toViews(List<FlatmateRequest> rows, boolean received) {
        Map<UUID, FlatmateRequestDto> details = hydrator.hydrate(rows).stream()
                .collect(Collectors.toMap(FlatmateRequestDto::id, Function.identity()));
        Map<UUID, User> people = users.findAllById(rows.stream()
                        .map(row -> received ? row.getRequesterId() : row.getHostId()).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        return rows.stream().map(row -> {
            UUID partyId = received ? row.getRequesterId() : row.getHostId();
            User person = people.get(partyId);
            String name = person == null || person.getName() == null || person.getName().isBlank()
                    ? "Someone" : person.getName();
            Target target = new Target(row.getTargetId(), targetType(row.getKind()),
                    details.get(row.getId()).targetTitle(), FlatmateLinks.of(row.getKind(), row.getTargetId()));
            String state = row.getStatus();
            return new RequestView(row.getId(), kind(), state, row.getStatus(),
                    new Party(partyId, name, person != null && person.isVerified()), target, row.getMessage(), null,
                    row.getRequestedAt(), PENDING.equals(state) ? null : row.getDecidedAt(), null, row.getHostId(),
                    row.getShare());
        }).toList();
    }

    private static String targetType(String flatmateKind) {
        return "flatmate".equals(flatmateKind) ? "flatmate-post" : flatmateKind;
    }
}
