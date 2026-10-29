package com.draazy.api.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class BuildStampFilter extends OncePerRequestFilter {
    public static final String BUILD_HEADER = "X-Draazy-Build";

    private static final int ID_LENGTH = 12;

    private final String buildId;

    private final PublicReadCacheFilter publicReads;

    BuildStampFilter(ObjectProvider<BuildProperties> build, PublicReadCacheFilter publicReads) {
        BuildProperties props = build.getIfAvailable();
        this.buildId = props == null ? null : digest(props);
        this.publicReads = publicReads;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (buildId != null && !publicReads.caches(request)) {
            response.setHeader(BUILD_HEADER, buildId);
        }
        chain.doFilter(request, response);
    }

    private static String digest(BuildProperties build) {
        String source = build.getGroup() + ':' + build.getArtifact() + ':' + build.getVersion() + ':' + build.getTime();
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, ID_LENGTH);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable on this JVM", e);
        }
    }
}
