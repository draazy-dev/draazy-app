package com.draazy.api.catalog.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.draazy.api.provider.FileStorage;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class PhotoVariantBackfillTest {
    private final PhotoKeys keys = new PhotoKeys("test-secret");
    private final Bucket bucket = new Bucket();
    private final PhotoVariantBackfill backfill = new PhotoVariantBackfill(
            bucket, keys, new PhotoService(bucket, keys, mock(PhotoUploadQuota.class)));

    @Test
    void aLegacyPhotoGainsWebpCopiesAndADoneOneIsNotEvenRead() throws Exception {
        String legacy = keys.newKey(UUID.randomUUID());
        bucket.put(legacy, jpeg(1200, 800));
        bucket.put(legacy + ".w960.jpg", jpeg(960, 640));
        bucket.put(legacy + ".w480.jpg", jpeg(480, 320));
        String done = keys.newKey(UUID.randomUUID()) + "-00ff00ff00ff00ff";
        bucket.put(done, jpeg(1200, 800));
        bucket.put(done + ".w960.webp", new byte[] {1});
        bucket.put(done + ".w480.webp", new byte[] {1});
        bucket.put("avatars/not-a-photo", new byte[] {1});

        assertThat(backfill.run()).isEqualTo(1);

        assertThat(bucket.objects).containsKeys(legacy + ".w960.webp", legacy + ".w480.webp");
        assertThat(bucket.reads).containsExactly(legacy);
        assertThat(backfill.run()).as("idempotent").isZero();
    }

    @Test
    void anUnreadableOriginalDoesNotStopTheRest() throws Exception {
        String broken = keys.newKey(UUID.randomUUID());
        bucket.put(broken, new byte[] {(byte) 0xFF, (byte) 0xD8, 0, 0});
        String fine = keys.newKey(UUID.randomUUID());
        bucket.put(fine, jpeg(800, 600));

        assertThat(backfill.run()).isEqualTo(1);

        assertThat(bucket.objects).containsKey(fine + ".w480.webp").doesNotContainKey(broken + ".w480.webp");
        bucket.reads.clear();
        assertThat(backfill.run()).isZero();
        assertThat(bucket.reads).as("a broken original is not re-read every run").isEmpty();
    }

    @Test
    void oneRunConvertsAtMostABatchSoTheJobStaysShort() throws Exception {
        byte[] photo = jpeg(64, 48);
        for (int i = 0; i <= PhotoVariantBackfill.BATCH; i++) {
            bucket.put(keys.newKey(UUID.randomUUID()), photo);
        }

        assertThat(backfill.run()).isEqualTo(PhotoVariantBackfill.BATCH);
        assertThat(backfill.run()).isEqualTo(1);
    }

    private static byte[] jpeg(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.ORANGE);
        g.fillRect(0, 0, w / 2, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }

    private static final class Bucket implements FileStorage {
        private final TreeMap<String, byte[]> objects = new TreeMap<>();
        private final List<String> reads = new ArrayList<>();

        void put(String key, byte[] content) {
            objects.put(key, content);
        }

        @Override
        public Stream<String> listPublic(String prefix) {
            return List.copyOf(objects.keySet()).stream().filter(key -> key.startsWith(prefix));
        }

        @Override
        public Optional<byte[]> readPublic(String key) {
            reads.add(key);
            return Optional.ofNullable(objects.get(key));
        }

        @Override
        public String storePublic(String key, byte[] content, String contentType) {
            objects.put(key, content);
            return "/cdn/" + key;
        }

        @Override
        public void store(String key, byte[] content, String contentType) {
            throw new UnsupportedOperationException();
        }

        @Override
        public String signedDownloadUrl(String key) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void delete(String key) {
            throw new UnsupportedOperationException();
        }

        @Override
        public String publicUrlPrefix() {
            return "/cdn/";
        }
    }
}
