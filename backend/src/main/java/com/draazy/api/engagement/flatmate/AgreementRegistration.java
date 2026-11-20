package com.draazy.api.engagement.flatmate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.LocalDate;
import lombok.Getter;

@Embeddable
@Getter
class AgreementRegistration {
    @Column(name = "agreement_valid_till")
    private LocalDate validTill;

    protected AgreementRegistration() {
    }

    AgreementRegistration(LocalDate validTill) {
        this.validTill = validTill;
    }

    boolean expiredOn(LocalDate on) {
        return validTill != null && validTill.isBefore(on);
    }
}
