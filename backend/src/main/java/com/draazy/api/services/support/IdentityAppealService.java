package com.draazy.api.services.support;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.verification.IdentityAppeal;
import com.draazy.api.identity.verification.IdentityAppealInfo;
import com.draazy.api.identity.verification.IdentityAppealRepository;
import com.draazy.api.identity.verification.IdentityAppeals;
import com.draazy.api.identity.verification.IdentityCaseReset;
import com.draazy.api.identity.verification.IdentityVerification;
import com.draazy.api.identity.verification.IdentityVerificationRepository;
import com.draazy.api.identity.verification.VerificationStatuses;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.AuthPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class IdentityAppealService {

    private static final int MAX_NOTE_CHARS = 500;
    private static final String VERIFY_LINK = "/verify-identity";

    private final IdentityVerificationRepository verifications;
    private final IdentityAppealRepository appeals;
    private final IdentityAppeals rules;
    private final SupportTicketService supportTickets;
    private final SupportTicketRepository ticketRepository;
    private final UserRepository users;
    private final Notifier notifier;
    private final DecisionMessenger messenger;
    private final AuditService audit;
    private final Clock clock;

    public IdentityAppealService(IdentityVerificationRepository verifications, IdentityAppealRepository appeals,
            IdentityAppeals rules, SupportTicketService supportTickets, SupportTicketRepository ticketRepository,
            UserRepository users, Notifier notifier, DecisionMessenger messenger, AuditService audit, Clock clock) {
        this.verifications = verifications;
        this.appeals = appeals;
        this.rules = rules;
        this.supportTickets = supportTickets;
        this.ticketRepository = ticketRepository;
        this.users = users;
        this.notifier = notifier;
        this.messenger = messenger;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public IdentityAppealInfo open(AuthPrincipal actor, IdentityAppealRequest body) {
        String note = cleanNote(body == null ? null : body.note());
        IdentityVerification v = verifications.findByUserIdForUpdate(actor.userId())
                .orElseThrow(() -> notAllowed("Only a rejected identity check can be appealed"));
        if (appeals.findByVerificationIdAndStatus(v.getId(), IdentityAppeal.OPEN).isPresent()) {
            throw new ConflictException(ErrorCodes.IDENTITY_APPEAL_OPEN, "An appeal is already open");
        }
        if (!rules.canAppeal(v)) {
            throw notAllowed(!VerificationStatuses.REJECTED.equals(v.getStatus())
                    ? "Only a rejected identity check can be appealed"
                    : v.getFilesPurgedAt() != null
                            ? "Your photos are no longer stored, so please try again with new ones"
                            : "This rejection was already reviewed on appeal");
        }
        SupportTicketDto ticket = supportTickets.create(actor, new SupportTicketCreate(
                "Identity check appeal", "identity_appeal",
                "I'd like a second look at my rejected identity check.\n\nNote: " + note));
        IdentityAppeal appeal = new IdentityAppeal(v.getId(), note);
        appeal.setTicketId(UUID.fromString(ticket.id()));
        appeals.saveAndFlush(appeal);
        audit.record(actor, "identity.appeal.opened", "identity_verification", v.getId().toString(),
                "appealId", appeal.getId().toString(), "ticketId", ticket.id());
        return IdentityAppealInfo.of(appeal);
    }

    @Transactional
    public IdentityAppealInfo uphold(AuthPrincipal staff, UUID verificationId) {
        return decide(staff, verificationId, false);
    }

    @Transactional
    public IdentityAppealInfo reopen(AuthPrincipal staff, UUID verificationId) {
        return decide(staff, verificationId, true);
    }

    private IdentityAppealInfo decide(AuthPrincipal staff, UUID verificationId, boolean reopen) {
        IdentityVerification v = verifications.findByIdForUpdate(verificationId)
                .orElseThrow(() -> new NotFoundException("Verification case not found"));
        IdentityAppeal appeal = appeals.findByVerificationIdAndStatus(verificationId, IdentityAppeal.OPEN)
                .filter(a -> VerificationStatuses.REJECTED.equals(v.getStatus()))
                .orElseThrow(() -> new ConflictException(ErrorCodes.IDENTITY_APPEAL_NONE,
                        "This case has no open appeal"));
        if (staff.userId().equals(v.getUserId())) {
            throw new ForbiddenException(ErrorCodes.IDENTITY_APPEAL_OWN_CASE,
                    "You cannot decide an appeal on your own identity case");
        }
        Instant now = Instant.now(clock);
        if (reopen) {
            reopenCase(v, now);
        }
        appeal.setStatus(reopen ? IdentityAppeal.REOPENED : IdentityAppeal.UPHELD);
        appeal.setDecidedBy(staff.userId());
        appeal.setDecidedAt(now);
        appeals.saveAndFlush(appeal);
        closeTicket(appeal.getTicketId());
        tellUser(v.getUserId(), reopen);
        audit.record(staff, reopen ? "identity.appeal.reopened" : "identity.appeal.upheld", "identity_verification",
                v.getId().toString(), "appealId", appeal.getId().toString(), "userId", v.getUserId().toString());
        return IdentityAppealInfo.of(appeal);
    }

    // Attempt counters stay (a reopen is not a user retry); submittedAt restarts so the stale sweep spares it.
    private void reopenCase(IdentityVerification v, Instant now) {
        if (v.getFilesPurgedAt() != null) {
            throw notAllowed("The photos are no longer stored, so this case can't be reopened");
        }
        v.setStatus(VerificationStatuses.PENDING);
        v.setReviewerId(null);
        v.setDecidedAt(null);
        v.setRejectionReason(null);
        v.setRejectionNote(null);
        v.setClaimedBy(null);
        v.setClaimedAt(null);
        v.setSubmittedAt(now);
        verifications.saveAndFlush(v);
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void onCaseReset(IdentityCaseReset event) {
        appeals.findFirstByVerificationIdOrderByCreatedAtDesc(event.verificationId())
                .filter(a -> IdentityAppeal.OPEN.equals(a.getStatus()) || IdentityAppeal.UPHELD.equals(a.getStatus()))
                .ifPresent(a -> {
                    if (IdentityAppeal.OPEN.equals(a.getStatus())) {
                        closeTicket(a.getTicketId());
                    }
                    a.setStatus(IdentityAppeal.SUPERSEDED);
                });
    }

    private void closeTicket(UUID ticketId) {
        if (ticketId != null) {
            ticketRepository.findById(ticketId).ifPresent(ticket -> {
                ticket.close();
                ticketRepository.saveAndFlush(ticket);
            });
        }
    }

    private void tellUser(UUID userId, boolean reopened) {
        notifier.notify(userId, reopened ? "identity.appeal.reopened" : "identity.appeal.upheld",
                reopened ? "Your ID is back in review" : "Your appeal was reviewed",
                reopened ? "We've reopened your identity check for a fresh review. We'll update you soon."
                        : "We took a second look and the original decision stands. You can retake your photos.",
                VERIFY_LINK);
        String line = reopened
                ? "Your Draazy identity appeal was accepted. Your ID is back in review and we'll update you soon."
                : "Your Draazy identity appeal was reviewed and the original decision stands. Open the app to try again.";
        users.findById(userId).filter(user -> notifier.allowsWhatsapp(userId))
                .ifPresent(user -> afterCommit(() -> messenger.sendIdentityDecision(user.getMobile(), line)));
    }

    private static void afterCommit(Runnable callback) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            callback.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                callback.run();
            }
        });
    }

    private static ConflictException notAllowed(String message) {
        return new ConflictException(ErrorCodes.IDENTITY_APPEAL_NOT_ALLOWED, message);
    }

    private static String cleanNote(String raw) {
        String note = raw == null ? "" : raw.trim();
        if (note.isEmpty()) {
            throw new BadRequestException("note is required");
        }
        if (note.length() > MAX_NOTE_CHARS) {
            throw new BadRequestException("note must be at most " + MAX_NOTE_CHARS + " characters");
        }
        return IdentityNoteRedaction.redact(note);
    }
}
