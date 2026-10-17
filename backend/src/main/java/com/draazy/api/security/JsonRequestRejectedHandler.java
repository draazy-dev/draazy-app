package com.draazy.api.security;

import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.web.RequestCorrelation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.stereotype.Component;

/** Answers a path the firewall refuses (encoded slash, "..", semicolon) with the JSON envelope. */
@Component
class JsonRequestRejectedHandler implements RequestRejectedHandler {

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            RequestRejectedException ex) throws IOException {
        boolean ownTrace = MDC.get(RequestCorrelation.TRACE_ID_MDC) == null;
        if (ownTrace) {
            MDC.put(RequestCorrelation.TRACE_ID_MDC, UUID.randomUUID().toString());
        }
        try {
            SecurityErrors.write(response, 400, ErrorCodes.BAD_REQUEST, "Bad request");
        } finally {
            if (ownTrace) {
                MDC.remove(RequestCorrelation.TRACE_ID_MDC);
            }
        }
    }
}
