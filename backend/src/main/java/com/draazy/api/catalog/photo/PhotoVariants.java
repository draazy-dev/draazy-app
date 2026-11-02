package com.draazy.api.catalog.photo;

import com.draazy.api.common.validation.MediaSignatures;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

final class PhotoVariants {
    static final int[] WIDTHS = {960, 480};

    private static final float QUALITY = 0.8f;
    private static final String LOSSY = "Lossy";
    private static final double DECODE_PIXEL_BUDGET = 8_000_000;

    private PhotoVariants() {
    }

    static String key(String originalKey, int width) {
        return originalKey + ".w" + width + ".webp";
    }

    static List<String> allKeys(String originalKey) {
        List<String> keys = new ArrayList<>();
        for (int width : WIDTHS) {
            keys.add(key(originalKey, width));
            keys.add(originalKey + ".w" + width + ".jpg");
        }
        return keys;
    }

    static Map<Integer, byte[]> of(byte[] photo) throws IOException {
        BufferedImage image = decode(photo, WIDTHS[0]);
        Map<Integer, byte[]> variants = new LinkedHashMap<>();
        if (image == null) {
            return variants;
        }
        for (int width : WIDTHS) {
            image = scale(image, Math.min(width, image.getWidth()));
            variants.put(width, encode(image));
        }
        return variants;
    }

    private static BufferedImage decode(byte[] photo, int widest) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(photo))) {
            Iterator<ImageReader> readers = in == null ? null : ImageIO.getImageReaders(in);
            if (readers == null || !readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                long width = reader.getWidth(0);
                long height = reader.getHeight(0);
                int step = (int) Math.max(Math.max(1, width / (2L * widest)),
                        Math.ceil(Math.sqrt((double) width * height / DECODE_PIXEL_BUDGET)));
                ImageReadParam param = reader.getDefaultReadParam();
                param.setSourceSubsampling(step, step, 0, 0);
                return reader.read(0, param);
            } finally {
                reader.dispose();
            }
        }
    }

    private static BufferedImage scale(BufferedImage source, int width) {
        BufferedImage current = source;
        while (current.getWidth() / 2 > width) {
            current = resize(current, current.getWidth() / 2);
        }
        return resize(current, width);
    }

    private static BufferedImage resize(BufferedImage source, int width) {
        int height = Math.max(1, Math.round((float) source.getHeight() * width / source.getWidth()));
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, width, height);
            g.drawImage(source, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static byte[] encode(BufferedImage image) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByMIMEType(MediaSignatures.WEBP).next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionType(LOSSY);
        param.setCompressionQuality(QUALITY);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }
}
