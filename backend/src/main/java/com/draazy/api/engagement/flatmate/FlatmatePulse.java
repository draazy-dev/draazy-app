package com.draazy.api.engagement.flatmate;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;

/** {@code initials} are the newest seekers' (names are already public on the feed); {@code split} is null when no
 * live group has its flat yet. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FlatmatePulse(long seeking, List<String> initials, Split split) {

    public static final int FACES = 3;

    /** {@code bhk} is null unless the group's flat is linked to a listing that states one. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Split(String locality, BigDecimal bhk, long rent, int seats, long share) {
    }
}
