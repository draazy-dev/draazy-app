package com.draazy.api.catalog.city;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Entity
@Table(name = "cities")
@Getter
public class City {
    @Id
    @Column(name = "slug", nullable = false, updatable = false)
    private String slug;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "live", nullable = false)
    private boolean live;

    void setLive(boolean live) {
        this.live = live;
    }

    protected City() {
    }
}
