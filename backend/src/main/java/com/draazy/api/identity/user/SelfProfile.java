package com.draazy.api.identity.user;

import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.Roles;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class SelfProfile {
    private final UserMapper userMapper;
    private final AccountPermissions accountPermissions;

    public SelfProfile(UserMapper userMapper, AccountPermissions accountPermissions) {
        this.userMapper = userMapper;
        this.accountPermissions = accountPermissions;
    }

    public SelfResponse of(User user) {
        UserResponse base = userMapper.toResponse(user);
        boolean backOffice = Roles.isBackOffice(user.getRole());
        List<String> desks = backOffice
                ? accountPermissions.desksFor(user.getRole(), user.getId()).stream().sorted().toList()
                : List.of();
        List<String> atoms = backOffice
                ? List.copyOf(accountPermissions.effectiveFor(user.getRole(), user.getId()))
                : null;
        return new SelfResponse(base.id(), base.name(), base.mobile(), base.email(), base.role(),
                base.verified(), base.city(), user.getGender(), user.genderChangesLeft(),
                base.verifiedContactOnly(), base.hideNumber(),
                base.shareActivityStatus(), base.shareReadReceipts(), base.listingsCount(), atoms,
                desks);
    }

    public SessionUser forSession(User user) {
        if (!Roles.isBackOffice(user.getRole())) {
            return of(user);
        }
        return new StaffSelfResponse(user.getId().toString(), user.getName(), user.getMobile(), user.getEmail(),
                user.getRole(),
                List.copyOf(accountPermissions.effectiveFor(user.getRole(), user.getId())),
                accountPermissions.desksFor(user.getRole(), user.getId()).stream().sorted().toList());
    }
}