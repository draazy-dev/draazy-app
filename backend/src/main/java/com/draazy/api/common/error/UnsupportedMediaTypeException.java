package com.draazy.api.common.error;

import org.springframework.http.HttpStatus;

public class UnsupportedMediaTypeException extends ApiException {
    public UnsupportedMediaTypeException(String message) {
        super(ErrorCodes.UNSUPPORTED_MEDIA_TYPE, HttpStatus.UNSUPPORTED_MEDIA_TYPE.value(), message);
    }
}
