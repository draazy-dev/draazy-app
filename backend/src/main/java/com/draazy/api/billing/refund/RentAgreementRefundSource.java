package com.draazy.api.billing.refund;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Rent-agreement refunds live with service requests (a higher layer),
// so the refunds desk reads them through this port.
public interface RentAgreementRefundSource {
    List<String> statusesFor(String deskStatus);

    long count(String deskStatus);

    Map<UUID, RefundDesk.Row> rows(Collection<UUID> ids);
}