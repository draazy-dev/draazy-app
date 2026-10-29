package com.draazy.api.identity.auth;

import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BotDefence;
import com.draazy.api.security.BotDefenceFilter;
import com.draazy.api.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    private final AuthService authService;
    private final StaffSignInService staffSignIn;
    private final StaffInviteService staffInvites;
    private final RefreshCookie refreshCookie;
    private final RefreshOriginGate refreshOrigins;
    private final BotDefence botDefence;
    private final OtpSendIpBudget otpIpBudget;

    public AuthController(AuthService authService, StaffSignInService staffSignIn,
            StaffInviteService staffInvites, RefreshCookie refreshCookie,
            RefreshOriginGate refreshOrigins, BotDefence botDefence, OtpSendIpBudget otpIpBudget) {
        this.authService = authService;
        this.staffSignIn = staffSignIn;
        this.staffInvites = staffInvites;
        this.refreshCookie = refreshCookie;
        this.refreshOrigins = refreshOrigins;
        this.botDefence = botDefence;
        this.otpIpBudget = otpIpBudget;
    }

    @PostMapping(Routes.Auth.LOGIN)
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest http) {
        if (!request.hasOtp()) {
            if (!BotDefenceFilter.verified(botDefence, http)) {
                throw new ForbiddenException(BotDefenceFilter.REFUSAL);
            }
            otpIpBudget.enforce(http);
        }
        return withRefreshCookie(authService.login(request), request.rememberDevice());
    }

    @PostMapping(Routes.Auth.STAFF_LOGIN)
    public AuthResponse staffLogin(@Valid @RequestBody StaffLoginRequest request) {
        return staffSignIn.checkPassword(request);
    }

    @PostMapping(Routes.Auth.STAFF_LOGIN_VERIFY)
    public ResponseEntity<AuthResponse> staffLoginVerify(@Valid @RequestBody StaffCodeRequest request) {
        return withRefreshCookie(staffSignIn.verify(request), request.rememberDevice());
    }

    @PostMapping(Routes.Auth.STAFF_LOGIN_ENROL)
    public StaffTotpEnrolment staffLoginEnrol(@Valid @RequestBody StaffEnrolRequest request) {
        return staffSignIn.startEnrolment(request);
    }

    @PostMapping(Routes.Auth.STAFF_LOGIN_ENROL_CONFIRM)
    public ResponseEntity<AuthResponse> staffLoginConfirm(@Valid @RequestBody StaffCodeRequest request) {
        return withRefreshCookie(staffSignIn.confirmEnrolment(request), request.rememberDevice());
    }

    @PostMapping(Routes.Auth.REFRESH)
    public ResponseEntity<AuthResponse> refresh(
            @RequestBody(required = false) RefreshRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        refreshOrigins.check(httpRequest);
        String presented = refreshCookie.presented(httpRequest);
        if (presented == null) {
            clearHint(httpRequest, response);
            throw new UnauthorizedException("Invalid refresh token");
        }
        try {
            return withRefreshCookie(authService.refresh(presented),
                    RefreshRequest.rememberDevice(request));
        } catch (UnauthorizedException e) {
            clearHint(httpRequest, response);
            throw e;
        }
    }

    private void clearHint(HttpServletRequest request, HttpServletResponse response) {
        String site = request.getHeader("Sec-Fetch-Site");
        if (site != null && !"same-origin".equals(site) && !"same-site".equals(site)
                && !"none".equals(site)) {
            return;
        }
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie.clearedHint().toString());
    }

    @PostMapping(Routes.Auth.STAFF_INVITE_REDEEM)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void redeemStaffInvite(@Valid @RequestBody StaffInviteRedeemRequest request) {
        staffInvites.redeem(request.token(), request.password());
    }

    @PostMapping(Routes.Auth.LOGOUT)
    public ResponseEntity<Void> logout(@CurrentUser AuthPrincipal principal) {
        authService.logout(principal.userId());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.cleared().toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.clearedHint().toString())
                .build();
    }

    private ResponseEntity<AuthResponse> withRefreshCookie(AuthResponse body, boolean remember) {
        if (body.refreshToken() == null) {
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.issued(body.refreshToken(), remember).toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.issuedHint(remember).toString())
                .body(body);
    }
}
