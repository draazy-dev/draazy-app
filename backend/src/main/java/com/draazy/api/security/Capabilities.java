package com.draazy.api.security;

public final class Capabilities {
    private Capabilities() {
    }

    public static final String VIEW_DASHBOARD = "view_dashboard";

    public static final String VIEW_SERVICE_REQUESTS = "view_service_requests";

    public static final String UPDATE_TICKET = "update_ticket";

    public static final String WILDCARD = "*";

    public static final String BEAN = "permissions";

    private static final String CALL = "@" + BEAN + ".granted(authentication, '";

    public static final String REQUIRE_VIEW_DASHBOARD = CALL + VIEW_DASHBOARD + "')";

    public static final String REQUIRE_VIEW_SERVICE_REQUESTS = CALL + VIEW_SERVICE_REQUESTS + "')";

    public static final String REQUIRE_UPDATE_TICKET = CALL + UPDATE_TICKET + "')";
}
