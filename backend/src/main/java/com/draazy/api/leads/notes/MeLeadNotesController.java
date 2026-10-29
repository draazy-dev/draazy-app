package com.draazy.api.leads.notes;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeLeadNotesController {
    private final LeadNoteService leadNotes;

    public MeLeadNotesController(LeadNoteService leadNotes) {
        this.leadNotes = leadNotes;
    }

    @GetMapping(Routes.MeLeadNotes.BASE)
    public List<LeadNoteResponse> myLeadNotes(@CurrentUser AuthPrincipal principal) {
        return leadNotes.myNotes(principal.userId());
    }

    @PutMapping(Routes.MeLeadNotes.BY_KEY)
    public ResponseEntity<LeadNoteResponse> saveLeadNote(@CurrentUser AuthPrincipal principal,
            @PathVariable @Size(max = 200) String leadKey, @Valid @RequestBody LeadNoteUpsert body) {
        return leadNotes.save(principal.userId(), leadKey, body.note(), body.followUpAt())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    public record LeadNoteUpsert(@Size(max = 2000) String note, Instant followUpAt) {
    }
}
