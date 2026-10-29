package com.draazy.api.catalog.city;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;

@Entity
@Table(name = "city_waitlist")
@Getter
public class CityWaitlistEntry extends BaseEntity {
    @Column(name = "mobile", nullable = false, updatable = false)
    private String mobile;

    @Column(name = "city", nullable = false, updatable = false)
    private String city;

    @Column(name = "email")
    private String email;

    protected CityWaitlistEntry() {
    }
}
