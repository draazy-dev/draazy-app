package com.draazy.api.leads.conversation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import com.draazy.api.common.error.PayloadTooLargeException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;

class MessagePhotoUploadTest {

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    private static byte[] pngHeaderDeclaring(int width, int height) {
        ByteBuffer ihdr = ByteBuffer.allocate(17).put("IHDR".getBytes(StandardCharsets.US_ASCII))
                .putInt(width).putInt(height).put((byte) 8).put((byte) 0).put((byte) 0).put((byte) 0).put((byte) 0);
        CRC32 crc = new CRC32();
        crc.update(ihdr.array());
        return ByteBuffer.allocate(8 + 4 + 17 + 4)
                .put(PNG_SIGNATURE).putInt(13).put(ihdr.array()).putInt((int) crc.getValue())
                .array();
    }

    private static byte[] png(int width, int height) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    @ParameterizedTest
    @CsvSource({"5000, 4801", "10001, 1", "6400, 6400"})
    void aCanvasOverTheCapIsRefusedFromItsHeader(int width, int height) {
        MockMultipartFile bomb = new MockMultipartFile("file", "x.png", "image/png", pngHeaderDeclaring(width, height));

        assertThatExceptionOfType(PayloadTooLargeException.class)
                .isThrownBy(() -> MessagePhotoUpload.process(UUID.randomUUID(), bomb))
                .withMessageContaining("24 megapixels");
    }

    @Test
    void aLargePhotoWithinTheCapIsShrunkToTheChatEdge() throws Exception {
        MockMultipartFile photo = new MockMultipartFile("file", "x.png", "image/png", png(4000, 1000));

        MessagePhotoUpload.Processed processed = MessagePhotoUpload.process(UUID.randomUUID(), photo);

        BufferedImage stored = ImageIO.read(new ByteArrayInputStream(processed.bytes()));
        assertThat(stored.getWidth()).isEqualTo(2048);
        assertThat(stored.getHeight()).isEqualTo(512);
    }
}