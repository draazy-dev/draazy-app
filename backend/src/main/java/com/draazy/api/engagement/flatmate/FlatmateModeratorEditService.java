package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Not the owner's update path, which re-derives tier, consent and agreement from the caller (here the moderator);
 * the edit is audited and does not send the post back for review. */
@Service
public class FlatmateModeratorEditService {

    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateGuardrails guardrails;
    private final AuditService audit;
    private final LocalityBinding localityBinding;

    FlatmateModeratorEditService(FlatmateSeekerPostRepository posts, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, FlatmateGuardrails guardrails, AuditService audit,
            LocalityBinding localityBinding) {
        this.posts = posts;
        this.rooms = rooms;
        this.groups = groups;
        this.guardrails = guardrails;
        this.audit = audit;
        this.localityBinding = localityBinding;
    }

    @Transactional
    public void edit(AuthPrincipal caller, UUID id, FlatmateModeratorEdit body) {
        Edited edited = posts.findLockedById(id)
                .map(p -> apply(caller, new UUID[] {p.getUserId()}, "flatmateSeekerPost",
                        () -> snapshot(p.getTitle(), p.getNote(), p.getBudget(), null, p.getLocalities(), p.getMoveInAt()),
                        () -> editPost(p, body)))
                .or(() -> rooms.findLockedById(id)
                        .map(r -> apply(caller, new UUID[] {r.getHostId()}, "flatmateRoom",
                                () -> snapshot(r.getTitle(), r.getNote(), r.getBudget(), r.getDeposit(),
                                        r.getLocalities(), r.getAvailableFrom()),
                                () -> editRoom(r, body))))
                .or(() -> groups.findLockedById(id)
                        .map(g -> apply(caller, g.parties(), "flatmateGroup",
                                () -> snapshot(g.getTitle(), g.getNote(), g.getRent(), g.getDeposit(),
                                        g.getLocalities(), g.getMoveInBy()),
                                () -> editGroup(g, body))))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        audit.record(caller, "flatmate.adminUpdate", edited.kind(), id.toString(),
                "fields", changedFields(body), "before", edited.before(), "after", edited.after());
    }

    private record Edited(String kind, Map<String, Object> before, Map<String, Object> after) {
    }

    private static Edited apply(AuthPrincipal caller, UUID[] parties, String kind,
            Supplier<Map<String, Object>> snapshot, Runnable change) {
        FlatmateModerationService.requireNotParty(caller, parties);
        Map<String, Object> before = snapshot.get();
        change.run();
        return new Edited(kind, before, snapshot.get());
    }

    private static Map<String, Object> snapshot(String title, String note, Long rent, Long deposit,
            List<String> localities, Object moveIn) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("title", title);
        values.put("note", note);
        values.put("rent", rent);
        values.put("deposit", deposit);
        values.put("localities", localities == null ? null : List.copyOf(localities));
        values.put("moveIn", moveIn == null ? null : moveIn.toString());
        return values;
    }

    private void editPost(FlatmateSeekerPost post, FlatmateModeratorEdit body) {
        refuse(body.deposit() != null, "A seeker post has no deposit.");
        if (body.title() != null) {
            post.setTitle(FlatmateVocabulary.blankToNull(body.title()));
        }
        if (body.note() != null) {
            post.setNote(FlatmateVocabulary.blankToNull(body.note()));
        }
        if (body.rent() != null) {
            refuse(post.getBudgetMax() != null && post.getBudgetMax() < body.rent(),
                    "The budget cannot be above the top of the seeker's range.");
            post.setBudget(body.rent());
        }
        if (body.localities() != null) {
            post.setLocalities(localityBinding.canonicalNames(
                    FlatmateSeekerService.clean(body.localities()), post.getLocalities()));
        }
        if (body.moveIn() != null) {
            post.setMoveIn(body.moveIn().toString());
            post.setMoveInAt(body.moveIn());
        }
        posts.saveAndFlush(post);
    }

    private void editRoom(FlatmateRoom room, FlatmateModeratorEdit body) {
        if (body.title() != null) {
            room.setTitle(FlatmateVocabulary.blankToNull(body.title()));
        }
        if (body.note() != null) {
            room.setNote(FlatmateVocabulary.blankToNull(body.note()));
        }
        if (body.rent() != null) {
            room.setBudget(body.rent());
        }
        if (body.deposit() != null) {
            room.setDeposit(body.deposit());
        }
        if (body.localities() != null) {
            String locality = single(localityBinding.canonicalNames(
                    FlatmateSeekerService.clean(body.localities()), room.getLocalities()));
            if (room.isSplitRoom() && !locality.equals(room.getLocality())) {
                throw new ConflictException(FlatmateConflicts.mark(
                        "This room came from splitting a flat, so its locality is the flat's. "
                                + "Edit the property instead.",
                        FlatmateConflicts.SPLIT_ROOM));
            }
            room.setLocality(locality);
            room.setLocalities(List.of(locality));
            room.setAddressFingerprint(refingerprint(room.getAddressFingerprint(),
                    new FlatmateGuardrails.Address(null, room.getSociety(), locality, null)));
        }
        if (body.moveIn() != null) {
            room.setAvailableFrom(body.moveIn());
        }
        rooms.saveAndFlush(room);
    }

    private void editGroup(FlatmateGroup group, FlatmateModeratorEdit body) {
        if (body.title() != null) {
            String title = body.title().strip();
            refuse(title.length() < 3, "A group's title needs at least 3 characters.");
            group.setTitle(title);
        }
        if (body.note() != null) {
            group.setNote(FlatmateVocabulary.blankToNull(body.note()));
        }
        if (body.rent() != null) {
            refuse(group.getRentMin() != null && group.getRentMin() > body.rent(),
                    "The rent cannot be below the group's lowest rent.");
            group.setRent(body.rent());
        }
        if (body.deposit() != null) {
            refuse(group.isHunting(), "A group still hunting for a flat has a deposit range, not a deposit.");
            group.setDeposit(body.deposit());
        }
        if (body.localities() != null) {
            List<String> localities = localityBinding.canonicalNames(
                    FlatmateSeekerService.clean(body.localities()), group.getLocalities());
            refuse(localities.isEmpty(), "A group needs a locality.");
            refuse(localities.size() > (group.isHunting() ? FlatmateVocabulary.MAX_LOCALITIES : 1),
                    "Too many localities for this group.");
            group.relocate(localities);
        }
        if (body.title() != null || body.localities() != null) {
            group.setAddressFingerprint(refingerprint(group.getAddressFingerprint(),
                    new FlatmateGuardrails.Address(null, null, group.getLocality(), group.getTitle())));
        }
        if (body.moveIn() != null) {
            refuse(!group.isHunting(), "Only a group hunting for a flat has a move-in date.");
            group.moveInBy(body.moveIn());
        }
        groups.saveAndFlush(group);
    }

    /** The duplicate/contested-address check matches on the stored fingerprint, so a corrected
     * address must move it. A flat-bound fingerprint is kept: the flat, not the text, is the address. */
    private String refingerprint(String current, FlatmateGuardrails.Address address) {
        return current != null && current.startsWith(FlatmateGuardrails.PROPERTY_PREFIX)
                ? current : guardrails.fingerprint(address);
    }

    private static String single(List<String> localities) {
        refuse(localities.size() != 1, "A room has exactly one locality.");
        return localities.get(0);
    }

    private static void refuse(boolean condition, String message) {
        if (condition) {
            throw new ValidationException(message);
        }
    }

    private static List<String> changedFields(FlatmateModeratorEdit body) {
        return Stream.of(
                body.title() == null ? null : "title",
                body.note() == null ? null : "note",
                body.rent() == null ? null : "rent",
                body.deposit() == null ? null : "deposit",
                body.localities() == null ? null : "localities",
                body.moveIn() == null ? null : "moveIn")
                .filter(Objects::nonNull).toList();
    }
}
