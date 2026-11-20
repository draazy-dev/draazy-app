package com.draazy.api.provider.scan;

import com.draazy.api.provider.DocumentScanner;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class BuiltInDocumentScanner implements DocumentScanner {
    private final long maxBytes;

    public BuiltInDocumentScanner(
            @Value("${draazy.providers.scan.max-bytes:10485760}") long maxBytes) {
        this.maxBytes = maxBytes;
    }

    private static final Map<String, String> EXTENSION_TYPES = Map.ofEntries(
            Map.entry("pdf", "application/pdf"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("jpe", "image/jpeg"),
            Map.entry("png", "image/png"),
            Map.entry("heic", "image/heic"),
            Map.entry("heif", "image/heic"),
            Map.entry("webp", "image/webp"));

    private static final Set<String> DANGEROUS_EXTENSIONS = Set.of(
            "exe", "com", "scr", "msi", "dll", "bat", "cmd", "ps1", "vbs", "js", "mjs", "jse",
            "wsf", "hta", "jar", "sh", "bash", "py", "php", "html", "htm", "xhtml", "svg", "swf",
            "lnk", "reg", "app", "dmg", "pkg", "deb", "rpm", "iso", "apk");

    private record Signature(String label, byte[] magic) {
    }

    private static final List<Signature> DANGEROUS_SIGNATURES = List.of(
            new Signature("a Windows program", new byte[] {'M', 'Z'}),
            new Signature("a Linux program", new byte[] {0x7F, 'E', 'L', 'F'}),
            new Signature("a macOS program",
                    new byte[] {(byte) 0xCF, (byte) 0xFA, (byte) 0xED, (byte) 0xFE}),
            new Signature("a Java class file",
                    new byte[] {(byte) 0xCA, (byte) 0xFE, (byte) 0xBA, (byte) 0xBE}),
            new Signature("an archive", new byte[] {'P', 'K', 0x03, 0x04}),
            new Signature("an archive", new byte[] {'P', 'K', 0x05, 0x06}),
            new Signature("a RAR archive", new byte[] {'R', 'a', 'r', '!'}),
            new Signature("a 7-Zip archive",
                    new byte[] {'7', 'z', (byte) 0xBC, (byte) 0xAF, 0x27, 0x1C}),
            new Signature("a compressed file", new byte[] {0x1F, (byte) 0x8B}));

    private record TextSignature(String label, String prefix) {
    }

    private static final List<TextSignature> DANGEROUS_TEXT_PREFIXES = List.of(
            new TextSignature("a web page", "<!doctype"),
            new TextSignature("a web page", "<html"),
            new TextSignature("a web page", "<head"),
            new TextSignature("a web page", "<script"),
            new TextSignature("an SVG image", "<svg"),
            new TextSignature("an XML file", "<?xml"),
            new TextSignature("a PHP script", "<?php"),
            new TextSignature("a shell script", "#!"));

    private static final int TEXT_PREFIX_WINDOW = 64;

    private static final Map<String, byte[]> PDF_ACTIVE_CONTENT = Map.of(
            "runs JavaScript", "/JavaScript".getBytes(StandardCharsets.US_ASCII),
            "can launch a program", "/Launch".getBytes(StandardCharsets.US_ASCII));

    @Override
    public Verdict scan(String fileName, String contentType, byte[] content) {
        if (content == null || content.length == 0) {
            return Verdict.rejected("That file is empty.");
        }
        if (content.length > maxBytes) {
            return Verdict.tooLarge("That file is too large to upload (max "
                    + (maxBytes / (1024 * 1024)) + " MB)");
        }

        String container = dangerousContainer(content);
        if (container != null) {
            return Verdict.rejected("That file is " + container
                    + ", not a document. Upload the original scan or PDF.");
        }

        Verdict byName = checkExtension(fileName, contentType);
        if (!byName.isClean()) {
            return byName;
        }

        if ("application/pdf".equals(contentType)) {
            for (var active : PDF_ACTIVE_CONTENT.entrySet()) {
                if (indexOf(content, active.getValue()) >= 0) {
                    return Verdict.rejected("That PDF " + active.getKey()
                            + ", which a property document never needs to do. "
                            + "Re-export or re-scan it and upload that.");
                }
            }
        }

        return Verdict.clean();
    }

    private static Verdict checkExtension(String fileName, String contentType) {
        String extension = extensionOf(fileName);
        if (extension.isEmpty()) {
            return Verdict.clean();
        }
        if (DANGEROUS_EXTENSIONS.contains(extension)) {
            return Verdict.rejected("A file named \"." + extension
                    + "\" is not a document, whatever it contains. Rename it to match the file you"
                    + " actually mean to upload.");
        }
        String promised = EXTENSION_TYPES.get(extension);
        if (promised != null && !promised.equals(contentType)) {
            return Verdict.rejected("That file is a " + contentType + " but is named \"."
                    + extension + "\". Rename it so the recipient's computer opens it correctly.");
        }
        return Verdict.clean();
    }

    private static String extensionOf(String fileName) {
        if (fileName == null) {
            return "";
        }
        String base = fileName.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1);
        int dot = base.lastIndexOf('.');
        if (dot < 0 || dot == base.length() - 1) {
            return "";
        }
        return base.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
    }

    private static String dangerousContainer(byte[] content) {
        for (Signature signature : DANGEROUS_SIGNATURES) {
            if (startsWith(content, signature.magic(), 0)) {
                return signature.label();
            }
        }
        int start = firstNonBlank(content);
        if (start >= 0) {
            String head = new String(content, start,
                    Math.min(TEXT_PREFIX_WINDOW, content.length - start), StandardCharsets.US_ASCII)
                    .toLowerCase(Locale.ROOT);
            for (TextSignature text : DANGEROUS_TEXT_PREFIXES) {
                if (head.startsWith(text.prefix())) {
                    return text.label();
                }
            }
        }
        return null;
    }

    private static int firstNonBlank(byte[] content) {
        int i = 0;
        if (startsWith(content, new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, 0)) {
            i = 3;
        }
        while (i < content.length && i < TEXT_PREFIX_WINDOW) {
            byte b = content[i];
            if (b != ' ' && b != '\t' && b != '\r' && b != '\n' && b != 0) {
                return i;
            }
            i++;
        }
        return -1;
    }

    private static boolean startsWith(byte[] content, byte[] prefix, int from) {
        if (content.length - from < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (content[from + i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return i;
        }
        return -1;
    }
}
