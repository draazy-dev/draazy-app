package com.draazy.api.common.error;

public class NotFoundException extends ApiException {
    public NotFoundException(String message) {
        super(ErrorCodes.NOT_FOUND, 404, message);
    }

    public static NotFoundException of(String resource) {
        return new NotFoundException(resource + " not found");
    }
}
