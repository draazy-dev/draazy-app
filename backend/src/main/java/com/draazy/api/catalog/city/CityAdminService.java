package com.draazy.api.catalog.city;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CityAdminService {
    private final CityRepository cities;
    private final CityWaitlistRepository waitlist;
    private final AuditService audit;

    public CityAdminService(CityRepository cities, CityWaitlistRepository waitlist,
            AuditService audit) {
        this.cities = cities;
        this.waitlist = waitlist;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<CityWaitlistDemandRow> expansionDemand() {
        return waitlist.demandByCity();
    }

    @Transactional
    public void updateLive(String slug, CityAdminUpdateRequest request, AuthPrincipal operator) {
        City city = cities.findById(slug).orElseThrow(() -> NotFoundException.of("City"));
        boolean before = city.isLive();
        boolean after = request.live();
        city.setLive(after);
        audit.record(operator, "city.update", "city", slug,
                "name", city.getName(),
                "beforeLive", before,
                "afterLive", after);
    }
}
