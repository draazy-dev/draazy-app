package com.draazy.api.services.ticket;

import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ServiceWaitlistRequest(
        @NotBlank @Size(max = 40) String service,
        @Size(max = 120) String name,
        @NotBlank @IndianMobile String mobile) {
}
