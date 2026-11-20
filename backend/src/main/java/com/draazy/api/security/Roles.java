package com.draazy.api.security;

public final class Roles {
    public static final String BUYER = "BUYER";
    public static final String OWNER = "OWNER";
    public static final String STAFF = "STAFF";
    public static final String MANAGER = "MANAGER";
    public static final String ADMIN = "ADMIN";

    private Roles() {
    }

    public static boolean isBackOffice(String wireRole) {
        return Wire.STAFF.equals(wireRole) || Wire.MANAGER.equals(wireRole)
                || Wire.ADMIN.equals(wireRole);
    }

    public static final class Wire {
        private Wire() {
        }

        public static final String BUYER = "buyer";

        public static final String OWNER = "owner";

        public static final String STAFF = "staff";

        public static final String MANAGER = "manager";

        public static final String ADMIN = "admin";
    }
}
