package com.draazy.api.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ValidationProblem(
        String error, String message, int status, String traceId, List<FieldError> fields) {
    public record FieldError(String field, String message) {
    }
}
