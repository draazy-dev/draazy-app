package com.draazy.api.moderation.verification;

import com.draazy.api.common.error.BadRequestException;
import java.util.Set;

public final class ReviewReasonCodes {
    public static final Set<String> ALL = Set.of("photos_not_real", "duplicate", "broker",
            "wrong_details", "locality_unclear", "document_unreadable", "name_mismatch",
            "rera_not_found", "rera_mismatch", "other");

    private ReviewReasonCodes() {
    }

    public static String require(String decision, String reasonCode, String note) {
        if (!"needs_info".equals(decision) && !"reject".equals(decision)) {
            return null;
        }
        if (reasonCode == null || reasonCode.isBlank()) {
            throw new BadRequestException("reason_code_required", "reasonCode is required for " + decision);
        }
        String normalized = reasonCode.trim();
        if (!ALL.contains(normalized)) {
            throw new BadRequestException("invalid_reason_code",
                    "reasonCode must be one of " + String.join(", ", ALL.stream().sorted().toList()));
        }
        if ("other".equals(normalized) && (note == null || note.isBlank())) {
            throw new BadRequestException("reason_note_required", "note is required when reasonCode is other");
        }
        return normalized;
    }

    public static String ownerMessage(String reasonCode, String note) {
        String message = switch (reasonCode) {
            case "photos_not_real" -> "Please add clear photos of the actual property.";
            case "duplicate" -> "Please tell us why this is not a duplicate listing.";
            case "broker" -> "Please confirm that you are the owner or family, not a broker.";
            case "wrong_details" -> "Please correct the listing details.";
            case "locality_unclear" -> "Please clarify the exact locality.";
            case "document_unreadable" -> "Please upload a readable document.";
            case "name_mismatch" -> "Please explain the name mismatch.";
            case "rera_not_found" -> "We could not find your RERA ID on MahaRERA. Please send the correct one.";
            case "rera_mismatch" -> "Your RERA ID on MahaRERA does not match this project. Please correct it.";
            default -> "Please share the missing information.";
        };
        return note == null || note.isBlank() ? message : message + " " + note.trim();
    }

    public static String rejectionMessage(String reasonCode, String note) {
        String message = switch (reasonCode) {
            case "photos_not_real" -> "The photos do not appear to be authentic.";
            case "duplicate" -> "This listing was identified as a duplicate of an existing listing.";
            case "broker" -> "Draazy is strictly owner-only.";
            case "wrong_details" -> "The listing contains inaccurate details.";
            case "locality_unclear" -> "The property locality could not be verified.";
            case "document_unreadable" -> "Ownership documents could not be verified.";
            case "name_mismatch" -> "Ownership documents show an unverified name mismatch.";
            case "rera_not_found" -> "The RERA ID could not be found on MahaRERA.";
            case "rera_mismatch" -> "The RERA ID on MahaRERA does not match this project.";
            default -> "The listing does not meet moderation guidelines.";
        };
        String base = note == null || note.isBlank() ? message : message + " " + note.trim();
        return base + " This decision is final. The listing cannot be resubmitted.";
    }
}
