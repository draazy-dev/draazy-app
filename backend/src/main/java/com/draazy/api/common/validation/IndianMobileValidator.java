package com.draazy.api.common.validation;

import com.draazy.api.common.trust.MobileMask;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.regex.Pattern;

public final class IndianMobileValidator implements ConstraintValidator<IndianMobile, String> {
    private static final Pattern STORED = Pattern.compile(Formats.MOBILE);

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        String normalised = MobileMask.normalise(value);
        return normalised != null && STORED.matcher(normalised).matches();
    }
}
