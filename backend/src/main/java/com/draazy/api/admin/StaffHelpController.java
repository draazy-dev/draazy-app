package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.Roles;
import java.io.IOException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@RestController
public class StaffHelpController {
    private static final String BACK_OFFICE =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.MANAGER + "', '" + Roles.ADMIN + "')";

    private static final List<String> BODY_FIELDS = List.of("html", "text", "headings");

    private final byte[] content;

    private final byte[] index;

    public StaffHelpController(@Value("classpath:help/staff-help.json") Resource staffHelp,
            ObjectMapper objectMapper) throws IOException {
        this.content = staffHelp.getContentAsByteArray();
        JsonNode tree = objectMapper.readTree(content);
        for (JsonNode article : tree.path("articles")) {
            ((ObjectNode) article).remove(BODY_FIELDS);
        }
        this.index = objectMapper.writeValueAsBytes(tree);
    }

    @GetMapping(value = Routes.Admin.HELP_STAFF, produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize(BACK_OFFICE)
    public byte[] staffHelp() {
        return content;
    }

    @GetMapping(value = Routes.Admin.HELP_STAFF_INDEX, produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize(BACK_OFFICE)
    public byte[] staffHelpIndex() {
        return index;
    }
}
