package com.draazy.api.moderation.user;

import java.util.List;

public record TeamAssignee(String id, String name, List<String> desks) {
}
