package com.draazy.api.common.web;

/** The correlation-id wiring shared by the filter that sets it and the error advice that reads it. */
public final class RequestCorrelation {

    /** SLF4J MDC key + the name the correlation id is stored under for the whole request. */
    public static final String TRACE_ID_MDC = "traceId";

    /** Request method and query-free path, read by the error appender; absent outside a request. */
    public static final String METHOD_MDC = "httpMethod";
    public static final String PATH_MDC = "httpPath";

    /** Set once a bearer token verifies: the user id (a UUID, never a name or contact) and role. */
    public static final String USER_ID_MDC = "userId";
    public static final String USER_ROLE_MDC = "userRole";

    /** Response header echoing the correlation id back to the caller. */
    public static final String TRACE_ID_HEADER = "X-Trace-Id";

    private RequestCorrelation() {
    }
}
