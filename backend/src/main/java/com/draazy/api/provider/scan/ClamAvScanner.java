package com.draazy.api.provider.scan;

import com.draazy.api.provider.DocumentScanner;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "draazy.providers.clamav", name = "enabled",
        havingValue = "true")
public class ClamAvScanner implements DocumentScanner {
    private static final Logger log = LoggerFactory.getLogger(ClamAvScanner.class);

    private static final byte[] INSTREAM = "zINSTREAM\0".getBytes(StandardCharsets.US_ASCII);

    private static final byte[] END_OF_STREAM = new byte[4];

    private final int chunkBytes;
    private final String host;
    private final int port;
    private final int timeoutMs;

    public ClamAvScanner(
            @Value("${draazy.providers.clamav.host:127.0.0.1}") String host,
            @Value("${draazy.providers.clamav.port:3310}") int port,
            @Value("${draazy.providers.clamav.timeout-ms:10000}") int timeoutMs,
            @Value("${draazy.providers.clamav.chunk-bytes:32768}") int chunkBytes) {
        this.host = host;
        this.port = port;
        this.timeoutMs = timeoutMs;
        this.chunkBytes = chunkBytes;
        log.info("ClamAV scanning is ON: uploads will be streamed to clamd at {}:{} "
                + "and REJECTED if it cannot be reached", host, port);
    }

    @Override
    public Verdict scan(String fileName, String contentType, byte[] content) {
        String reply = converse(content);

        if (reply.endsWith("OK") && !reply.contains("FOUND")) {
            return Verdict.clean();
        }
        if (reply.endsWith("FOUND")) {
            // Log the signature name, never return it: in a response it tells a prober
            // which mutation got closest.
            log.warn("clamd rejected an upload: signature={} contentType={}", reply, contentType);
            return Verdict.rejected(
                    "That file was rejected by our virus scanner. If you believe this is wrong, "
                            + "re-scan the original document and upload that.");
        }

        throw new UncheckedIOException(new IOException(
                "clamd at " + host + ":" + port + " gave an unusable reply: " + reply));
    }

    private String converse(byte[] content) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);

            try (OutputStream raw = socket.getOutputStream();
                    BufferedOutputStream out = new BufferedOutputStream(raw);
                    InputStream in = socket.getInputStream()) {
                out.write(INSTREAM);
                for (int offset = 0; offset < content.length; offset += chunkBytes) {
                    int length = Math.min(chunkBytes, content.length - offset);
                    out.write(new byte[] {
                            (byte) (length >>> 24), (byte) (length >>> 16),
                            (byte) (length >>> 8), (byte) length});
                    out.write(content, offset, length);
                }
                out.write(END_OF_STREAM);
                out.flush();

                return readReply(in);
            }
        } catch (IOException e) {
            log.error("clamd at {}:{} is unreachable -- REJECTING the upload rather than storing an "
                    + "unscanned file. Fix the daemon or set draazy.providers.clamav.enabled=false"
                    + " and accept that only the built-in structural check runs.", host, port, e);
            throw new UncheckedIOException("document scanner unavailable", e);
        }
    }

    private static String readReply(InputStream in) throws IOException {
        var buffer = new java.io.ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1 && b != 0) {
            buffer.write(b);
        }
        if (buffer.size() == 0) {
            throw new IOException("clamd closed the connection without replying");
        }
        return buffer.toString(StandardCharsets.US_ASCII).trim();
    }
}
