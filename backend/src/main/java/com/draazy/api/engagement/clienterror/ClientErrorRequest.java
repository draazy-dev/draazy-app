package com.draazy.api.engagement.clienterror;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** A browser-side failure report. Every string is scrubbed and truncated by the service, not trusted. */
public record ClientErrorRequest(

        @NotBlank
        @Pattern(regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
                message = "reference must be a UUID")
        String reference,

        @NotBlank
        @Pattern(regexp = "render|error|unhandledrejection",
                message = "kind must be render, error or unhandledrejection")
        String kind,

        String scope,

        @NotBlank
        @Pattern(regexp = "/.*", message = "path must start with /")
        String path,

        String name,
        String message,
        String stack,
        String componentStack,
        String build,
        String lastTraceId,
        @Valid Context context) {

    public record Context(String viewport, Boolean online, String userAgent, String deployEnv) {
    }
}
