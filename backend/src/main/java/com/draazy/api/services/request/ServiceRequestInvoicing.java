package com.draazy.api.services.request;

import com.draazy.api.billing.credit.Invoices;
import com.draazy.api.common.settings.PlatformSettings;
import java.time.Instant;
import org.springframework.stereotype.Component;

/** Issues the invoice when a rent-agreement checkout or an amendment top-up is paid. */
@Component
class ServiceRequestInvoicing {

    private final Invoices invoices;
    private final PlatformSettings settings;

    ServiceRequestInvoicing(Invoices invoices, PlatformSettings settings) {
        this.invoices = invoices;
        this.settings = settings;
    }

    // Only the platform fee is Draazy's; stamp duty and registration are passed through.
    void checkoutPaid(ServiceRequest request) {
        invoices.issue(request.getRequesterId(), Invoices.SERVICE_REQUEST, request.getId(), request.getPaymentRef(),
                request.getAmount() == null ? 0 : request.getAmount(), settings.rentAgreementPlatform(),
                Instant.now());
    }

    // A top-up moves the statutory lines only, so none of it is taxable.
    void amendmentPaid(ServiceRequest request, ServiceRequestAmendment amendment) {
        invoices.issue(request.getRequesterId(), Invoices.SERVICE_REQUEST_AMENDMENT, amendment.getId(),
                amendment.getPaymentRef(), amendment.delta(), 0, Instant.now());
    }
}
