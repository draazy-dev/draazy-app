package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.managed.ManagedFlatmateHomes;
import com.draazy.api.catalog.managed.ManagedProperty;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The owner's side of a confirmed flatmate room: their flats, the rooms tenants have in them, and the answers the
 * listing wizard can start from. Everything is keyed by the caller, so a stranger's id is a 404. */
@Service
public class FlatmateOwnerHomeService {

    private static final String FALLBACK_NAME = "Your tenant";

    private final ManagedFlatmateHomes homes;
    private final FlatmateRoomRepository rooms;
    private final UserRepository users;

    public FlatmateOwnerHomeService(ManagedFlatmateHomes homes, FlatmateRoomRepository rooms, UserRepository users) {
        this.homes = homes;
        this.rooms = rooms;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<OwnerHomeDto> list(UUID callerId) {
        String mobile = mobileOf(callerId);
        List<ManagedProperty> records = homes.homesOf(callerId);
        Map<String, List<FlatmateRoom>> roomsByFlat = new HashMap<>();
        records.forEach(m -> roomsByFlat.put(m.getAddressFingerprint(),
                rooms.findConfirmedInFlat(mobile, m.getAddressFingerprint())));
        Map<UUID, String> tenants = firstNames(roomsByFlat.values().stream().flatMap(List::stream)
                .map(FlatmateRoom::getHostId).distinct().toList());
        return records.stream()
                .map(m -> new OwnerHomeDto(m.getId().toString(), Objects.toString(m.getPublishedListingId(), null),
                        m.getTitle(), m.getSociety(), m.getLocality(), m.getBhk(), m.getFurnishing(),
                        roomsByFlat.get(m.getAddressFingerprint()).stream()
                                .map(r -> roomOf(r, tenants.getOrDefault(r.getHostId(), FALLBACK_NAME))).toList()))
                .toList();
    }

    @Transactional(readOnly = true)
    public OwnerHomePrefillDto prefill(UUID callerId, String managedId) {
        ManagedProperty home = homes.homeOf(callerId, managedId).orElseThrow(() -> NotFoundException.of("Home"));
        FlatmateRoom source = rooms.findConfirmedInFlat(mobileOf(callerId), home.getAddressFingerprint()).stream()
                .filter(r -> r.getId().equals(home.getSourceRoomId()))
                .findFirst()
                .orElse(null);
        return source == null ? fromRecord(home) : fromRoom(home, source);
    }

    private static OwnerHomeDto.Room roomOf(FlatmateRoom r, String tenant) {
        return new OwnerHomeDto.Room(r.getId().toString(), r.getTitle(), r.getRoomType(), r.getBudget(),
                r.getDeposit(), r.getStatus(), r.getModStatus(), r.getAvailableFrom(),
                r.getPhotos().isEmpty() ? null : r.getPhotos().getFirst(), tenant);
    }

    private static OwnerHomePrefillDto fromRoom(ManagedProperty home, FlatmateRoom r) {
        FlatmateRoomDetails d = r.getDetails();
        return new OwnerHomePrefillDto(home.getId().toString(), r.getHomeTypeLabel(), r.getBhk(),
                r.isGatedCommunity(), r.getFurnishing(), r.getFacing(), r.getOverlooking(), r.getLocality(),
                home.getLocalitySlug(), r.getSociety(), Objects.toString(r.getSocietyId(), null), r.getFlatNumber(),
                r.getLat(), r.getLng(), d == null ? null : d.floor(), d == null ? null : d.totalFloors(),
                d == null ? null : d.floorsInHouse(), d == null ? null : d.bathrooms(),
                d == null ? null : d.balconies(), d == null ? null : d.furniture(), d == null ? null : d.tower(),
                d == null ? null : d.street(), d == null ? null : d.landmark(), d == null ? null : d.pincode());
    }

    private static OwnerHomePrefillDto fromRecord(ManagedProperty home) {
        String bhk = home.getBhk() == null ? null : String.valueOf(home.getBhk().intValue());
        String furnishing = "semi-furnished".equals(home.getFurnishing()) ? "semi" : home.getFurnishing();
        return new OwnerHomePrefillDto(home.getId().toString(), null, bhk, null, furnishing, null, null,
                home.getLocality(), home.getLocalitySlug(), home.getSociety(), null, null, null, null, null, null,
                null, null, null, null, null, null, null, null);
    }

    private String mobileOf(UUID callerId) {
        return users.findById(callerId).map(User::getMobile).orElseThrow(() -> NotFoundException.of("User"));
    }

    private Map<UUID, String> firstNames(List<UUID> hostIds) {
        Map<UUID, String> names = new HashMap<>();
        users.findAllById(hostIds).forEach(u -> names.put(u.getId(), firstName(u.getName())));
        return names;
    }

    private static String firstName(String name) {
        if (name == null || name.isBlank()) {
            return FALLBACK_NAME;
        }
        String first = name.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }
}
