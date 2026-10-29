package com.draazy.api.catalog.listing;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CoherentDimensions.Validator.class)
public @interface CoherentDimensions {
    String message() default "contradicts another dimension on this listing";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    interface Dimensions {
        Integer floor();

        Integer totalFloors();
    }

    class Validator implements ConstraintValidator<CoherentDimensions, Dimensions> {
        @Override
        public boolean isValid(Dimensions in, ConstraintValidatorContext context) {
            if (in == null) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            boolean valid = true;
            if (in.floor() != null && in.totalFloors() != null && in.floor() > in.totalFloors()) {
                valid = report(context, "floor", "cannot be above the building's top floor");
            }
            return valid;
        }

        private static boolean report(ConstraintValidatorContext context, String field, String message) {
            context.buildConstraintViolationWithTemplate(message)
                    .addPropertyNode(field)
                    .addConstraintViolation();
            return false;
        }
    }
}
