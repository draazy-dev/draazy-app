package com.draazy.api.catalog.fee;

import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.web.Routes;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// Public on purpose: the fee is why someone picks zero brokerage, so it shows before sign-up.
// The rent row's platform fee is the admin figure ServiceRequestPricing bills.
@RestController
public class FeeController {

    private final PlatformFeeRepository fees;
    private final FeeMapper feeMapper;
    private final PlatformSettings settings;

    public FeeController(PlatformFeeRepository fees, FeeMapper feeMapper, PlatformSettings settings) {
        this.fees = fees;
        this.feeMapper = feeMapper;
        this.settings = settings;
    }

    @GetMapping(Routes.Fees.BASE)
    @Transactional(readOnly = true)
    public List<FeeResponse> list() {
        return fees.findAllByOrderByDealAsc().stream()
                .map(feeMapper::toResponse)
                .map(this::withAdminRentFee)
                .toList();
    }

    private FeeResponse withAdminRentFee(FeeResponse fee) {
        if (!PlatformFee.RENT.equals(fee.deal())) {
            return fee;
        }
        return new FeeResponse(fee.deal(), fee.brokerage(), settings.rentAgreementPlatform(), fee.stampDuty(),
                fee.registration(), fee.notes());
    }
}
