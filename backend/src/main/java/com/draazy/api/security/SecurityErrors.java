package com.draazy.api.security;

import com.draazy.api.common.web.RequestCorrelation;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.http.MediaType;

final class SecurityErrors {
    private SecurityErrors() {
    }

    static void write(HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String traceId = MDC.get(RequestCorrelation.TRACE_ID_MDC);
        StringBuilder json = new StringBuilder()
                .append("{\"error\":\"").append(escape(code))
                .append("\",\"message\":\"").append(escape(message))
                .append("\",\"status\":").append(status);
        if (traceId != null) {
            json.append(",\"traceId\":\"").append(escape(traceId)).append('"');
        }
        json.append('}');
        response.getWriter().write(json.toString());
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                .replace("\b", "\\b")
                .replace("\f", "\\f");
    }
}
