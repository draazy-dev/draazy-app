package com.draazy.api.engagement.flatmate;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;

/** {@code initials} are the newest seekers' (names are already public on the feed); {@code split} is null when no
 * team is hunting on the board. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FlatmatePulse(long seeking, List<String> initials, Split split) {

    public static final int FACES = 3;

    /** {@code rent} is the team's whole-flat budget; {@code bhk} is null unless the team wants exactly one size. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Split(String locality, BigDecimal bhk, long rent, int seats, long share) {
    }
}
