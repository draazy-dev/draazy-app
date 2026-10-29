package com.draazy.api.common.error;

import com.draazy.api.common.web.RequestCorrelation;
import jakarta.validation.ConstraintViolationException;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.web.SortHandlerMethodArgumentResolver;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.core.JacksonException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final String UNSTORABLE_CHARACTER = "22021";

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApi(ApiException ex) {
        HttpHeaders headers = new HttpHeaders();
        Integer retryAfterSeconds = ex instanceof RateLimitedException rate ? Integer.valueOf(rate.getRetryAfterSeconds())
                : ex instanceof ServiceUnavailableException down ? down.getRetryAfterSeconds() : null;
        if (retryAfterSeconds != null) {
            headers.add(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        }
        Integer attemptsRemaining =
                ex instanceof OtpIncorrectException otp ? otp.getAttemptsRemaining() : null;
        return ResponseEntity.status(ex.getStatus())
                .headers(headers)
                .body(new ApiError(ex.getCode(), ex.getMessage(), ex.getStatus(), traceId(),
                        attemptsRemaining, retryAfterSeconds,
                        ex instanceof RefundNotEligibleException refund ? refund.getReason() : null,
                        ex instanceof DuplicateSubmissionException dup ? dup.getExistingId().toString() : null,
                        ex instanceof ReminderTooSoonException soon ? soon.getNextReminderAt().toString() : null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationProblem> handleBodyValidation(MethodArgumentNotValidException ex) {
        List<ValidationProblem.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::toFieldError)
                .toList();
        return validationProblem(fields);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ValidationProblem> handleHandlerValidation(HandlerMethodValidationException ex) {
        List<ValidationProblem.FieldError> fields = ex.getParameterValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream()
                        .map(err -> new ValidationProblem.FieldError(
                                err instanceof FieldError nested
                                        ? nested.getField()
                                        : r.getMethodParameter().getParameterName(),
                                err.getDefaultMessage())))
                .toList();
        return validationProblem(fields);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ValidationProblem> handleConstraint(ConstraintViolationException ex) {
        List<ValidationProblem.FieldError> fields = ex.getConstraintViolations().stream()
                .map(v -> new ValidationProblem.FieldError(
                        v.getPropertyPath().toString(), v.getMessage()))
                .toList();
        return validationProblem(fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException ex) {
        log.debug("Unreadable request body: {}", ex.getMessage());
        String field = fieldPath(ex);
        String message = field == null ? ErrorCodes.Messages.MALFORMED_BODY
                : "Invalid value for field: " + field;
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(ErrorCodes.BAD_REQUEST, message, 400, traceId()));
    }

    private static String fieldPath(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof JacksonException json && !json.getPath().isEmpty()) {
                StringBuilder path = new StringBuilder();
                for (JacksonException.Reference ref : json.getPath()) {
                    if (ref.getPropertyName() != null) {
                        path.append(path.isEmpty() ? "" : ".").append(ref.getPropertyName());
                    } else if (ref.getIndex() >= 0) {
                        path.append('[').append(ref.getIndex()).append(']');
                    }
                }
                return path.isEmpty() || path.length() > 100 ? null : path.toString();
            }
        }
        return null;
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MissingServletRequestPartException.class,
            MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> handleBadParameter(Exception ex) {
        String name = ex instanceof MissingServletRequestParameterException missing
                ? missing.getParameterName()
                : ex instanceof MissingServletRequestPartException missing
                        ? missing.getRequestPartName()
                : ((MethodArgumentTypeMismatchException) ex).getName();
        return badParameter(name);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex) {
        boolean fromSortResolver = Arrays.stream(ex.getStackTrace())
                .anyMatch(frame -> frame.getClassName().equals(SortHandlerMethodArgumentResolver.class.getName()));
        return fromSortResolver ? badParameter("sort") : handleUncaught(ex);
    }

    private static ResponseEntity<ApiError> badParameter(String name) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(ErrorCodes.BAD_REQUEST,
                        "Invalid or missing request parameter: " + name, 400, traceId()));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        HttpHeaders headers = new HttpHeaders();
        if (ex.getSupportedHttpMethods() != null) {
            headers.setAllow(ex.getSupportedHttpMethods());
        }
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .headers(headers)
                .body(new ApiError(ErrorCodes.METHOD_NOT_ALLOWED,
                        ErrorCodes.Messages.METHOD_NOT_ALLOWED, 405, traceId()));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException ex) {
        log.debug("Unsupported content type: {}", ex.getContentType());
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(new ApiError(ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
                        ErrorCodes.Messages.UNSUPPORTED_CONTENT_TYPE, 415, traceId()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoRoute(NoResourceFoundException ex) {
        log.debug("No route for {} {}", ex.getHttpMethod(), ex.getResourcePath());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError(ErrorCodes.NOT_FOUND, "That route does not exist", 404, traceId()));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiError> handleAuth(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ApiError(ErrorCodes.UNAUTHORIZED, ErrorCodes.Messages.AUTH_REQUIRED,
                        401, traceId()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError(ErrorCodes.FORBIDDEN,
                        ErrorCodes.Messages.ACCESS_DENIED, 403, traceId()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(new ApiError(ErrorCodes.PAYLOAD_TOO_LARGE,
                        "That file is too large to upload", 413, traceId()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataIntegrity(DataIntegrityViolationException ex) {
        if (NestedExceptionUtils.getMostSpecificCause(ex) instanceof SQLException sql
                && UNSTORABLE_CHARACTER.equals(sql.getSQLState())) {
            log.debug("Unstorable character in input");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ApiError(ErrorCodes.BAD_REQUEST, "The request contains an invalid character",
                            400, traceId()));
        }
        log.warn("Database rejected a write", ex);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError(ErrorCodes.CONFLICT,
                        "That request conflicts with existing data", 409, traceId()));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleOptimisticLock(OptimisticLockingFailureException ex) {
        log.info("Concurrent update rejected: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError(ErrorCodes.CONFLICT,
                        "Someone else changed this while you were editing it. Reload and try again.",
                        409, traceId()));
    }

    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleClientGone(AsyncRequestNotUsableException ex) {
        log.debug("Client disconnected: {}", ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUncaught(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(ErrorCodes.INTERNAL, "Something went wrong", 500, traceId()));
    }

    private static ResponseEntity<ValidationProblem> validationProblem(
            List<ValidationProblem.FieldError> fields) {
        return ResponseEntity.unprocessableEntity()
                .body(new ValidationProblem(ErrorCodes.VALIDATION_FAILED,
                        "Request validation failed", 422, traceId(), fields));
    }

    private static ValidationProblem.FieldError toFieldError(FieldError fe) {
        return new ValidationProblem.FieldError(fe.getField(), fe.getDefaultMessage());
    }

    private static String traceId() {
        return MDC.get(RequestCorrelation.TRACE_ID_MDC);
    }
}
