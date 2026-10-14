package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.Roles;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// The JSON is generated from frontend/src/content/help by `npm run gen:staff-help`; CI fails when it is stale.
@RestController
public class StaffHelpController {

    private static final String BACK_OFFICE =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.MANAGER + "', '" + Roles.ADMIN + "')";

    private final byte[] content;

    public StaffHelpController(@Value("classpath:help/staff-help.json") Resource staffHelp) throws IOException {
        this.content = staffHelp.getContentAsByteArray();
    }

    @GetMapping(value = Routes.Admin.HELP_STAFF, produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize(BACK_OFFICE)
    public byte[] staffHelp() {
        return content;
    }
}
