package com.draazy.api.identity.user.erasure;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.verification.IdentityFilePurgeService;
import com.draazy.api.identity.verification.IdentityVerificationService;
import com.draazy.api.security.AuthPrincipal;
import jakarta.persistence.EntityManager;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ErasureService {
    private static final ObjectMapper DOCUMENT_JSON = JsonMapper.builder().build();

    private static final long MOBILE_BLOCK_SIZE = 6_000_000_000L;

    private final ErasureRequestRepository requests;
    private final UserRepository users;
    private final AuditService audit;
    private final EntityManager entityManager;
    private final IdentityVerificationService identity;
    private final IdentityFilePurgeService filePurge;
    private final ApplicationEventPublisher events;

    private final String pepper;

    public ErasureService(ErasureRequestRepository requests, UserRepository users,
            AuditService audit, EntityManager entityManager, IdentityVerificationService identity,
            IdentityFilePurgeService filePurge, ApplicationEventPublisher events,
            @Value("${draazy.erasure.pepper:}") String pepper) {
        this.events = events;
        this.requests = requests;
        this.users = users;
        this.audit = audit;
        this.entityManager = entityManager;
        this.identity = identity;
        this.filePurge = filePurge;
        this.pepper = pepper == null ? "" : pepper;
    }

    @Transactional
    public ErasureRequestResponse request(AuthPrincipal subject, String reason) {
        requests.findBySubjectIdAndStatus(subject.userId(), ErasureStatuses.PENDING)
                .ifPresent(existing -> {
                    throw new ConflictException(
                            "You already have an erasure request awaiting a decision.");
                });
        ErasureRequest saved = requests.saveAndFlush(
                new ErasureRequest(subject.userId(), digest(subject.userId()), reason));

        audit.record(subject, "erasure.request", "erasure_request", saved.getId().toString(),
                "reason", reason);
        return ErasureRequestResponse.of(saved);
    }

    @Transactional(readOnly = true)
    public Page<ErasureRequestResponse> mine(AuthPrincipal subject, Pageable pageable) {
        return requests.findBySubjectIdOrderByRequestedAtDesc(subject.userId(), pageable)
                .map(ErasureRequestResponse::of);
    }

    @Transactional(readOnly = true)
    public Page<ErasureRequestResponse> queue(String status, Integer days, Pageable pageable) {
        boolean unfiltered = status == null || status.isBlank();
        if (!unfiltered && !ErasureStatuses.isValid(status)) {
            throw new BadRequestException("Unknown erasure request status: " + status);
        }
        Instant since = PlatformTime.sinceOrNull(days);
        return requests.queue(unfiltered ? null : status, since == null ? Instant.EPOCH : since, pageable)
                .map(ErasureRequestResponse::of);
    }

    @Transactional
    public ErasureRequestResponse decide(AuthPrincipal admin, String id, String decision,
            String note) {
        ErasureRequest request = requests.findForDecision(
                        Ids.parseUuid(id).orElseThrow(() -> NotFoundException.of("Erasure request")))
                .orElseThrow(() -> NotFoundException.of("Erasure request"));
        if (!ErasureStatuses.isDecidable(request.getStatus())) {
            throw new ConflictException(
                    "This erasure request was already %s. A fresh ask is a fresh request."
                            .formatted(request.getStatus()));
        }
        if (ErasureDecisions.REJECT.equals(decision)) {
            if (note == null || note.isBlank()) {
                throw new BadRequestException(
                        "A rejected erasure request must say why — the subject is entitled to know "
                                + "which obligation blocked it and when they can ask again.");
            }
            request.reject(admin.userId(), note.trim());
            audit.record(admin, "erasure.reject", "erasure_request", id, "note", note.trim());
            return ErasureRequestResponse.of(request);
        }
        if (!ErasureDecisions.EXECUTE.equals(decision)) {
            throw new BadRequestException("decision must be one of " + ErasureDecisions.ALL);
        }
        return ErasureRequestResponse.of(execute(admin, request, note));
    }

    private ErasureRequest execute(AuthPrincipal admin, ErasureRequest request, String note) {
        UUID subjectId = request.getSubjectId();
        User subject = users.findById(subjectId)
                .orElseThrow(() -> NotFoundException.of("User"));
        String oldMobile = subject.getMobile();

        Map<String, Object> erased = new LinkedHashMap<>();

        erased.put("otp_codes", entityManager
                .createNativeQuery(
                        "delete from otp_codes where mobile = :mobile or requested_by = :id")
                .setParameter("mobile", oldMobile)
                .setParameter("id", subjectId)
                .executeUpdate());
        erased.put("refresh_tokens", entityManager
                .createNativeQuery("delete from refresh_tokens where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());
        erased.put("push_subscriptions", entityManager
                .createNativeQuery("delete from push_subscriptions where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("outbound_message", entityManager
                .createNativeQuery("delete from outbound_message where recipient_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("notifications", entityManager
                .createNativeQuery("delete from notifications where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("identity_conflicts", entityManager
                .createNativeQuery("delete from identity_conflicts where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("user_living_style", entityManager
                .createNativeQuery("delete from user_living_style where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("identity_verifications", identity.erase(subjectId));
        erased.put("owner_kyc", entityManager
                .createNativeQuery("""
                        update owner_kyc
                           set pan_masked = null,
                               aadhaar_masked = null
                         where user_id = :id
                        """)
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("tenant_profiles", entityManager
                .createNativeQuery("""
                        update tenant_profiles
                           set name = null,
                               occupation = null,
                               income = null,
                               occupants = null,
                               move_in = null,
                               prior_landlord = null,
                               about = null
                         where user_id = :id
                        """)
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("service_request_identities", entityManager
                .createNativeQuery("""
                        update service_request_identities
                           set pan = null,
                               aadhaar = null,
                               party_name = null,
                               purged_at = coalesce(purged_at, now())
                         where service_request_id in (
                                   select id from service_requests where requester_id = :id)
                        """)
                .setParameter("id", subjectId)
                .executeUpdate());

        // Must run before the mobile is replaced: the CHECK forces mobile XOR user_id, so the row
        // is deleted. Claimed rows are untouched by design.
        erased.put("service_request_parties", entityManager
                .createNativeQuery("delete from service_request_parties where mobile = :mobile")
                .setParameter("mobile", oldMobile)
                .executeUpdate());

        erased.put("page_views", entityManager
                .createNativeQuery("""
                        update page_views
                           set user_id = null
                         where user_id = :id
                        """)
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("tenant_rentals", entityManager
                .createNativeQuery("delete from tenant_rentals where tenant_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("help_article_feedback", entityManager
                .createNativeQuery("delete from help_article_feedback where user_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate());

        erased.put("crm_leads", entityManager
                .createNativeQuery("delete from crm_leads where user_id = :id or mobile = :mobile")
                .setParameter("id", subjectId)
                .setParameter("mobile", MobileMask.normalise(oldMobile))
                .executeUpdate());

        erased.put("personal_documents", erasePersonalDocuments(subjectId));

        erased.put("managed_properties", entityManager
                .createNativeQuery("""
                        update managed_properties
                           set rented = false,
                               tenant_name = null,
                               tenant_mobile = null,
                               tenant_since = null,
                               landlord_pan = case when owner_id = :id then null else landlord_pan end
                         where tenant_mobile = :mobile or owner_id = :id
                        """)
                .setParameter("mobile", MobileMask.normalise(oldMobile))
                .setParameter("id", subjectId)
                .executeUpdate());

        events.publishEvent(new AccountErased(subjectId));

        erased.put("service_request_draft_approvals", entityManager
                .createNativeQuery("delete from service_request_draft_approvals"
                        + " where user_id = :id or mobile_hash = :mobileHash")
                .setParameter("id", subjectId)
                .setParameter("mobileHash", Tokens.sha256Hex(MobileMask.normalise(oldMobile)))
                .executeUpdate());

        subject.erasePersonalData(freePseudonym(subjectId));
        erased.put("users", 1);

        String erasedJson = DOCUMENT_JSON.writeValueAsString(erased);
        String retainedJson = DOCUMENT_JSON.writeValueAsString(Map.of(
                "retained", ErasureRetention.retainedWithReasons(),
                "notYetSwept", ErasureRetention.knownGaps()));
        request.complete(admin.userId(), note, erasedJson, retainedJson);

        audit.record(admin, "erasure.execute", "erasure_request", request.getId().toString(),
                "erased", erased, "note", note);
        return request;
    }

    @SuppressWarnings("unchecked")
    private int erasePersonalDocuments(UUID subjectId) {
        List<String> keys = entityManager
                .createNativeQuery("""
                        select p.storage_key from personal_documents p
                         where p.owner_id = :id
                           and not exists (select 1 from documents d where d.storage_key = p.storage_key)
                        """)
                .setParameter("id", subjectId)
                .getResultList();
        filePurge.purgeKeys(keys);
        return entityManager
                .createNativeQuery("delete from personal_documents where owner_id = :id")
                .setParameter("id", subjectId)
                .executeUpdate();
    }

    private String freePseudonym(UUID subjectId) {
        for (int salt = 0; ; salt++) {
            String candidate = pseudonymMobile(subjectId, salt);
            if (!users.existsByMobile(candidate)) {
                return candidate;
            }
        }
    }

    static String pseudonymMobile(UUID subjectId) {
        return pseudonymMobile(subjectId, 0);
    }

    private static String pseudonymMobile(UUID subjectId, int salt) {
        BigInteger hash = new BigInteger(1, sha256("mobile:" + subjectId + (salt == 0 ? "" : ":" + salt)));
        long tail = hash.mod(BigInteger.valueOf(MOBILE_BLOCK_SIZE)).longValueExact();
        return String.format("%010d", tail);
    }

    String digest(UUID subjectId) {
        byte[] bytes = sha256(pepper + subjectId);
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16))
                    .append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }

    public static final class ErasureDecisions {
        private ErasureDecisions() {
        }

        public static final String EXECUTE = "execute";
        public static final String REJECT = "reject";

        static final List<String> ALL = List.of(EXECUTE, REJECT);
    }
}
