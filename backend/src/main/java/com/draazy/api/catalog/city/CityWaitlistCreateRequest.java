package com.draazy.api.catalog.city;

import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CityWaitlistCreateRequest(
        @NotBlank
        @IndianMobile String mobile,

        @NotBlank @Size(max = 120)
        @Pattern(regexp = "\\s*\\p{L}[\\p{L}\\p{M} .'-]*", message = "city must be a place name")
        String city,

        @Email @Size(max = 254) String email) {
}
