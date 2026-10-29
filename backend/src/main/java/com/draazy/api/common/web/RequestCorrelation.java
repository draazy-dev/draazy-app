package com.draazy.api.common.web;

public final class RequestCorrelation {
    public static final String TRACE_ID_MDC = "traceId";

    public static final String METHOD_MDC = "httpMethod";
    public static final String PATH_MDC = "httpPath";

    public static final String USER_ID_MDC = "userId";
    public static final String USER_ROLE_MDC = "userRole";

    public static final String TRACE_ID_HEADER = "X-Trace-Id";

    private RequestCorrelation() {
    }
}
