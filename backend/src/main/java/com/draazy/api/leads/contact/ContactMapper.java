package com.draazy.api.leads.contact;

import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import java.util.Set;
import java.util.UUID;
import org.mapstruct.Context;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

// Mobile-bearing projections are hand-written defaults so the mask-until-approved rule (ADR-019) is reviewable code,
// and the mask helper is private so MapStruct cannot adopt it as an implicit String converter.
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ContactMapper {

    @Mapping(target = "id", source = "request.id")
    @Mapping(target = "propertyId", source = "request.propertyId")
    @Mapping(target = "status", source = "request.status")
    @Mapping(target = "message", source = "request.message")
    @Mapping(target = "createdAt", source = "request.createdAt")
    @Mapping(target = "requester", source = "requester")
    @Mapping(target = "contact", source = "requester")
    ContactRequestResponse toResponse(ContactRequest request, User requester,
            @Context ContactVisibility visibility, @Context Set<UUID> verifiedIds);

    default ContactRequestResponse.Party toParty(User requester, @Context Set<UUID> verifiedIds) {
        if (requester == null) {
            return null;
        }
        return new ContactRequestResponse.Party(
                requester.getName(), maskMobile(requester.getMobile()), "buyer",
                verifiedIds != null && verifiedIds.contains(requester.getId()));
    }

    default ContactRequestResponse.Contact toContact(User requester,
            @Context ContactVisibility visibility) {
        if (requester == null || visibility != ContactVisibility.REVEALED) {
            return null;
        }
        return new ContactRequestResponse.Contact(requester.getName(), requester.getMobile());
    }

    /** Opaque-id convention: the wire exposes the UUID as a string. */
    default String map(UUID value) {
        return value == null ? null : value.toString();
    }

    private String maskMobile(String mobile) {
        return MobileMask.mask(mobile);
    }
}
