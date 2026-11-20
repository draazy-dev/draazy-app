package com.draazy.api.services.request;

import com.draazy.api.common.error.ValidationException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

public record RegistrationParticulars(String documentNo, String sro, String registeredOn, String grn) {

    private static final Pattern DOCUMENT_NO = Pattern.compile("[A-Z0-9][A-Z0-9 ./-]{0,38}[A-Z0-9]");
    private static final Pattern SRO = Pattern.compile("[A-Za-z][A-Za-z0-9 .,()-]{1,59}");

    private static final Pattern GRN = Pattern.compile("MH[0-9A-Z]{8,23}");

    public record Valid(String documentNo, String sro, LocalDate registeredOn, String grn) {
    }

    Valid validate(LocalDate today, LocalDate earliest) {
        List<String> bad = new ArrayList<>();
        String number = upper(documentNo);
        if (!DOCUMENT_NO.matcher(number).matches() || number.chars().noneMatch(Character::isDigit)) {
            bad.add("document number");
        }
        String office = strip(sro);
        if (!SRO.matcher(office).matches()) {
            bad.add("Sub-Registrar office");
        }
        LocalDate on = date(registeredOn);
        if (on == null || on.isAfter(today) || on.isBefore(earliest)) {
            bad.add("registration date (between " + earliest + " and " + today + ")");
        }
        String challan = normalisedGrn(grn);
        if (challan == null) {
            bad.add("GRAS challan GRN");
        }
        if (!bad.isEmpty()) {
            throw new ValidationException("A registered rent agreement needs its registration record — check the "
                    + String.join(", ", bad) + ".");
        }
        return new Valid(number, office, on, challan);
    }

    static String normalisedGrn(String value) {
        String challan = upper(value).replace(" ", "");
        return GRN.matcher(challan).matches() ? challan : null;
    }

    private static String strip(String value) {
        return value == null ? "" : value.strip().replaceAll("\\s+", " ");
    }

    private static String upper(String value) {
        return strip(value).toUpperCase(Locale.ROOT);
    }

    private static LocalDate date(String value) {
        try {
            return value == null ? null : LocalDate.parse(value.strip());
        } catch (DateTimeParseException malformed) {
            return null;
        }
    }
}
