package com.draazy.api.finance.tenancy;

import java.util.Set;

public final class OccupantTypes {
    private OccupantTypes() {
    }

    public static final String FAMILY = "family";

    public static final String BACHELOR_MALE = "bachelor_male";

    public static final String BACHELOR_FEMALE = "bachelor_female";

    public static final String COMPANY_LEASE = "company_lease";

    private static final Set<String> ALL =
            Set.of(FAMILY, BACHELOR_MALE, BACHELOR_FEMALE, COMPANY_LEASE);

    public static boolean isValid(String value) {
        return value == null || ALL.contains(value);
    }
}
