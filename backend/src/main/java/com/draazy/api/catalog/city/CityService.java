package com.draazy.api.catalog.city;

import com.draazy.api.catalog.property.ListingCounts;
import com.draazy.api.common.trust.MobileMask;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CityService {
    private final CityRepository cities;
    private final CityWaitlistRepository waitlist;
    private final ListingCounts listingCounts;
    private final CityMapper cityMapper;

    public CityService(CityRepository cities, CityWaitlistRepository waitlist,
            ListingCounts listingCounts, CityMapper cityMapper) {
        this.cities = cities;
        this.waitlist = waitlist;
        this.listingCounts = listingCounts;
        this.cityMapper = cityMapper;
    }

    @Transactional(readOnly = true)
    public List<CityResponse> list() {
        Map<String, Long> counts = listingCounts.byCity();
        return cities.findAllByOrderByLiveDescNameAsc().stream()
                .map(city -> cityMapper.toResponse(
                        city, counts.getOrDefault(city.getName().toLowerCase(Locale.ROOT), 0L)))
                .toList();
    }

    @Transactional
    public void joinWaitlist(CityWaitlistCreateRequest request) {
        waitlist.insertIfAbsent(
                MobileMask.normalise(request.mobile()), request.city().trim(), request.email());
    }
}
