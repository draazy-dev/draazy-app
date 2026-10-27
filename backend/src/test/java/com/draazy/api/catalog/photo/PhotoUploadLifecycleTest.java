package com.draazy.api.catalog.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.FileStorage;
import com.draazy.api.support.AbstractApiTest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

class PhotoUploadLifecycleTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    PhotoKeys keys;

    @Autowired
    PhotoUploadSweep sweep;

    @Autowired
    PhotoUploadQuota quota;

    @MockitoSpyBean
    FileStorage storage;

    private User owner;

    @BeforeEach
    void owner() {
        User u = new User("9822003101", "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        owner = users.saveAndFlush(u);
    }

    private String uploaded(Duration ago) {
        String key = keys.newKey(owner.getId());
        jdbc.update("INSERT INTO photo_uploads (storage_key, uploader_id, created_at) VALUES (?, ?, ?)",
                key, owner.getId(), Timestamp.from(Instant.now().minus(ago)));
        return key;
    }

    private long recorded() {
        return jdbc.queryForObject("SELECT count(*) FROM photo_uploads WHERE uploader_id = ?", Long.class, owner.getId());
    }

    private ResultActions upload() throws Exception {
        return mvc.perform(multipart(Routes.MePhotos.BASE)
                .file(new MockMultipartFile("file", "room.png", "image/png", TinyImages.png()))
                .header(HttpHeaders.AUTHORIZATION, bearer(owner)));
    }

    @Test
    void anUploadIsRecordedAgainstItsUploader() throws Exception {
        upload().andExpect(status().isCreated());

        assertThat(recorded()).isEqualTo(1);
    }

    @Test
    void anUploadOverTheDailyCapIsRefusedAndNotRecorded() throws Exception {
        for (int i = 0; i < quota.maxPerWindow(); i++) {
            uploaded(Duration.ofHours(23));
        }

        upload().andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"));
        assertThat(recorded()).isEqualTo(quota.maxPerWindow());
    }

    @Test
    void uploadsOlderThanTheWindowNoLongerCount() throws Exception {
        for (int i = 0; i < quota.maxPerWindow(); i++) {
            uploaded(Duration.ofHours(25));
        }

        upload().andExpect(status().isCreated());
    }

    @Test
    void theSweepDeletesOnlyUploadsPastTheGraceThatNothingShows() {
        String abandoned = uploaded(PhotoUploadSweep.GRACE.plusDays(1));
        String avatar = uploaded(PhotoUploadSweep.GRACE.plusDays(1));
        String fresh = uploaded(PhotoUploadSweep.GRACE.minusDays(1));
        jdbc.update("UPDATE users SET avatar = ? WHERE id = ?", storage.publicUrlPrefix() + avatar, owner.getId());

        sweep.sweep(Instant.now());

        verify(storage).deletePublic(abandoned);
        verify(storage).deletePublic(abandoned + ".w480.jpg");
        verify(storage, never()).deletePublic(startsWith(avatar));
        verify(storage, never()).deletePublic(startsWith(fresh));
        assertThat(jdbc.queryForList("SELECT storage_key FROM photo_uploads WHERE uploader_id = ?",
                String.class, owner.getId())).containsExactly(fresh);
    }

    @Test
    void aDeleteThatFailsKeepsItsRowForTheNextRun() {
        String stuck = uploaded(PhotoUploadSweep.GRACE.plusDays(1));
        doThrow(new IllegalStateException("R2 down")).when(storage).deletePublic(stuck);

        assertThat(sweep.sweep(Instant.now())).isZero();
        assertThat(recorded()).isEqualTo(1);
    }
}
