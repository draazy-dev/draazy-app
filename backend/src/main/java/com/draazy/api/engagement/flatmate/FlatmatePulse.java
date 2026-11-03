package com.draazy.api.engagement.flatmate;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record FlatmatePulse(long seeking, List<String> initials, Map<String, Long> tabs, Split split) {
    public static final int FACES = 3;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Split(String locality, BigDecimal bhk, long rent, int seats, long share) {
    }
}
