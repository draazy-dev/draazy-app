package com.draazy.api.catalog.property;

public final class PropertyTypeLabel {
    private PropertyTypeLabel() {
    }

    public static final String PATTERN =
            "(?i).*(office|shop|showroom|retail|commercial|warehouse|godown|industrial"
                    + "|co-working|coworking"
                    + "|independent house|row house|villa / house"
                    + "|flat|studio|penthouse|apartment"
                    + "|villa"
                    + "|farm ?land"
                    + "|plot).*";

    public static final String PATTERN_MESSAGE =
            "must name a recognised property type, or the listing cannot be found by its type filter";
}
