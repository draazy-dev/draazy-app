package com.draazy.api.services.request;

public record MaskedIdentityDto(String partyRole, int partyIndex, String pan, String aadhaar) {

    private static final int SHOWN = 4;

    static MaskedIdentityDto of(ServiceRequestIdentity row) {
        return new MaskedIdentityDto(row.getPartyRole(), row.getPartyIndex(),
                mask(row.getPan(), "XXXXXX"), mask(row.getAadhaar(), "XXXX XXXX "));
    }

    private static String mask(String number, String hidden) {
        return number == null || number.length() < SHOWN ? null
                : hidden + number.substring(number.length() - SHOWN);
    }
}
