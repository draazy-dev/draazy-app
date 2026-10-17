package com.draazy.api.common.web;

import com.draazy.api.common.error.ErrorCodes;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.apache.catalina.connector.Request;
import org.apache.catalina.connector.Response;
import org.apache.catalina.valves.ErrorReportValve;

/** Replaces Tomcat's HTML error page for requests it refuses before the servlet runs (encoded slash, bad escapes). */
public class JsonErrorReportValve extends ErrorReportValve {

    @Override
    protected void report(Request request, Response response, Throwable throwable) {
        int status = response.getStatus();
        if (status < 400 || response.getContentWritten() > 0 || !response.setErrorReported()) {
            return;
        }
        String traceId = response.getHeader(RequestCorrelation.TRACE_ID_HEADER);
        if (traceId == null) {
            traceId = UUID.randomUUID().toString();
            response.setHeader(RequestCorrelation.TRACE_ID_HEADER, traceId);
        }
        String body = "{\"error\":\"" + code(status) + "\",\"message\":\"" + message(status)
                + "\",\"status\":" + status + ",\"traceId\":\"" + traceId + "\"}";
        try {
            response.setContentType("application/json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // the client has gone; there is nobody to tell
        }
    }

    private static String code(int status) {
        return switch (status) {
            case 400 -> ErrorCodes.BAD_REQUEST;
            case 401 -> ErrorCodes.UNAUTHORIZED;
            case 403 -> ErrorCodes.FORBIDDEN;
            case 404 -> ErrorCodes.NOT_FOUND;
            case 405 -> ErrorCodes.METHOD_NOT_ALLOWED;
            case 409 -> ErrorCodes.CONFLICT;
            default -> status < 500 ? ErrorCodes.BAD_REQUEST : ErrorCodes.INTERNAL;
        };
    }

    private static String message(int status) {
        return switch (status) {
            case 401 -> ErrorCodes.Messages.AUTH_REQUIRED;
            case 403 -> ErrorCodes.Messages.ACCESS_DENIED;
            case 404 -> "Not found";
            case 405 -> ErrorCodes.Messages.METHOD_NOT_ALLOWED;
            default -> status < 500 ? "Bad request" : "Something went wrong";
        };
    }
}
