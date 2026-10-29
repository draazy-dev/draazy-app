package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.auth.OtpCode;
import com.draazy.api.identity.auth.OtpService;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.OtpSender;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateOwnerConsentService {
    private final FlatmateOwnerConsentRepository consents;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateGuardrails guardrails;

    private final FlatmateReviewRepository reviews;
    private final UserRepository users;
    private final OtpService otpService;
    private final AuditService audit;

    public FlatmateOwnerConsentService(FlatmateOwnerConsentRepository consents,
            FlatmateRoomRepository rooms, FlatmateGroupRepository groups,
            FlatmateGuardrails guardrails, FlatmateReviewRepository reviews,
            UserRepository users, OtpService otpService, AuditService audit) {
        this.consents = consents;
        this.rooms = rooms;
        this.groups = groups;
        this.guardrails = guardrails;
        this.reviews = reviews;
        this.users = users;
        this.otpService = otpService;
        this.audit = audit;
    }

    // noRollbackFor must repeat OtpService.verifyCode's list,
    // or a shorter list here resets the 3-guess ceiling.
    @Transactional(noRollbackFor = {OtpSender.DeliveryFailedException.class,
            UnauthorizedException.class, RateLimitedException.class})
    public boolean ownerConsent(AuthPrincipal caller, String title, String society, String locality,
            String ownerMobile, String otp) {
        String mobile = normalise(caller, ownerMobile);
        String fingerprint = guardrails.fingerprint(
                new FlatmateGuardrails.Address(null, society, locality, title));
        if (fingerprint == null) {
            throw new BadRequestException(
                    "Name the flat first — give the post a locality, and a society or a title.");
        }
        if (FlatmateVocabulary.blankToNull(otp) == null) {
            send(caller.userId(), mobile, fingerprint);
            return false;
        }
        record(caller, mobile, otp, fingerprint);
        applyConsentToLivePosts(caller.userId(), mobile, fingerprint);
        return true;
    }

    // Consent comes from the consent table, never the request.
    // Must run after mapper.applyTo and after the fingerprint.
    void settleRoomConsent(AuthPrincipal caller, FlatmateRoom room) {
        room.setOwnerConsent(
                has(room.getOwnerConsentMobile(), caller.userId(), room.getAddressFingerprint()));
    }

    private void applyConsentToLivePosts(UUID hostId, String mobile, String fingerprint) {
        List<UUID> roomIds = rooms.findByAddressFingerprintAndArchivedFalseOrderByIdAsc(fingerprint).stream()
                .filter(room -> hostId.equals(room.getHostId()))
                .filter(room -> mobile.equals(room.getOwnerConsentMobile()))
                .map(FlatmateRoom::getId).toList();
        List<UUID> groupIds = groups.findByAddressFingerprintAndArchivedFalseOrderByIdAsc(fingerprint).stream()
                .filter(group -> hostId.equals(group.getHostId()))
                .filter(group -> mobile.equals(group.getOwnerConsentMobile()))
                .map(FlatmateGroup::getId).toList();
        roomIds.forEach(rooms::markOwnerConsent);
        groupIds.forEach(groups::markOwnerConsent);
        Stream.concat(roomIds.stream(), groupIds.stream()).forEach(reviews::markOwnerConsent);
    }

    void grantFromNotice(UUID hostId, String ownerMobile, String addressFingerprint) {
        consents.insertIfAbsent(ownerMobile, hostId.toString(), addressFingerprint);
        applyConsentToLivePosts(hostId, ownerMobile, addressFingerprint);
    }

    public String normalise(AuthPrincipal caller, String ownerMobile) {
        String mobile = MobileMask.normalise(ownerMobile);
        if (mobile == null) {
            throw new BadRequestException("Enter the owner's mobile number.");
        }
        User self = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        if (mobile.equals(self.getMobile())) {
            throw new BadRequestException(ErrorCodes.OWNER_CONSENT_SELF,
                    "That is your own number. Consent has to come from the flat's owner.");
        }
        return mobile;
    }

    public void send(UUID caller, String ownerMobile, String addressFingerprint) {
        otpService.sendCode(ownerMobile, purposeFor(addressFingerprint), caller);
    }

    public int resendCooldownSeconds() {
        return otpService.resendCooldownSeconds();
    }

    @Transactional(noRollbackFor = {OtpSender.DeliveryFailedException.class,
            UnauthorizedException.class, RateLimitedException.class})
    public void record(AuthPrincipal caller, String ownerMobile, String otp,
            String addressFingerprint) {
        if (addressFingerprint == null) {
            throw new BadRequestException(
                    "Name the flat first — give the post a title and locality, then ask the owner.");
        }
        otpService.verifyCode(ownerMobile, otp.strip(), purposeFor(addressFingerprint));
        consents.insertIfAbsent(ownerMobile, caller.userId().toString(), addressFingerprint);
        audit.record(caller, "flatmate.ownerConsent", "flatmateOwnerConsent", ownerMobile,
                "ownerMobile", ownerMobile, "address", addressFingerprint);
    }

    private static String purposeFor(String addressFingerprint) {
        return OtpCode.PURPOSE_OWNER_CONSENT + ":" + Tokens.sha256Hex(addressFingerprint);
    }

    @Transactional(readOnly = true)
    public boolean has(String ownerMobile, UUID grantedBy, String addressFingerprint) {
        return ownerMobile != null && addressFingerprint != null
                && consents.existsByOwnerMobileAndGrantedByAndAddressFingerprint(
                        ownerMobile, grantedBy, addressFingerprint);
    }
}
