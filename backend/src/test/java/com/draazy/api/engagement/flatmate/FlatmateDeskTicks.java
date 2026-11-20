package com.draazy.api.engagement.flatmate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

final class FlatmateDeskTicks {
    static final List<String> CHECKS = List.of(
            "Photos are real and match the post",
            "Not a duplicate of another post",
            "Details and location look right");

    private FlatmateDeskTicks() {
    }

    static void tickAll(MockMvc mvc, String authorization, String id) throws Exception {
        for (String check : CHECKS) {
            tick(mvc, authorization, id, check, true);
        }
    }

    static void tick(MockMvc mvc, String authorization, String id, String check, boolean pass)
            throws Exception {
        mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_CHECKLIST, id)
                        .header(HttpHeaders.AUTHORIZATION, authorization)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"item\":\"" + check + "\",\"pass\":" + pass + "}"))
                .andExpect(status().isOk());
    }
}
