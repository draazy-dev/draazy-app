package com.draazy.api.identity.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UserUpdate(

        @Size(min = 2, max = 80) @Pattern(regexp = "\\p{L}[\\p{L}\\p{M} .'-]*") String name,
        @Email String email,
        String avatar,
        String city,
        @Pattern(regexp = "male|female") String gender,
        Boolean changeGender,
        Boolean hideNumber,
        Boolean verifiedContactOnly,
        Boolean shareActivityStatus,
        Boolean shareReadReceipts) {
        public UserUpdate {
                if (name != null) {
                        name = name.strip();
                }
        }
}
