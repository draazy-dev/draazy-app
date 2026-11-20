package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.FlatmateCaseFiles;
import java.util.Map;

public record FlatmateModerationDetailDto(
        FlatmateModerationQueueDto item,
        FlatmateRoomDto room,
        FlatmateGroupDto group,
        FlatmateSeekerPostDto post,
        FlatmateReviewDto review,
        Map<String, Integer> livingStyle,
        FlatmateCaseFiles.CaseView caseFile) {
}
