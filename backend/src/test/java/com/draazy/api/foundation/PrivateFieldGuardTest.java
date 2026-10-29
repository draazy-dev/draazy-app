package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.PropertyMapper;
import com.draazy.api.catalog.property.PropertyResponse;
import com.draazy.api.common.trust.PrivateFieldVisibility;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Trust — private listing fields cannot be mapped by accident")
class PrivateFieldGuardTest {
    @Test
    @DisplayName("every PropertyMapper method returning a PropertyResponse takes a visibility")
    void noMapperMethodCanProduceAResponseWithoutDecidingOnPrivateFields() {
        List<Method> producers = Arrays.stream(PropertyMapper.class.getMethods())
                .filter(method -> PropertyResponse.class.equals(method.getReturnType()))
                .toList();

        assertThat(producers)
                .describedAs("PropertyMapper no longer produces PropertyResponse — has the mapper"
                        + " moved? This guard is now inert and must follow it.")
                .isNotEmpty();

        assertThat(producers).allSatisfy(method -> assertThat(method.getParameterTypes())
                .describedAs("%s returns a PropertyResponse without taking a"
                        + " PrivateFieldVisibility, so MapStruct will copy electricityMeterNo and"
                        + " address by name and the caller has no way to say no. Add the @Context"
                        + " parameter and the guarding @Mapping expressions, as toResponse does.",
                        method.getName())
                .contains(PrivateFieldVisibility.class));
    }
}
