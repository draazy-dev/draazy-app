package com.draazy.api.admin;

import java.util.Map;

// Body and etag come from one transaction. Separate reads could pair a stale etag with a
// newer body, so the next conditional PUT passes and overwrites an unseen edit.
public record SettingsDocument(Map<String, Object> body, String etag) {
}
