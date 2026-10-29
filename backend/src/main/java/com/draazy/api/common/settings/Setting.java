package com.draazy.api.common.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "settings")
@Getter
public class Setting {
    @Id
    @Column(name = "key", nullable = false, updatable = false)
    private String key;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "value", nullable = false)
    @Setter
    private String value = "{}";

    protected Setting() {
    }

    public Setting(String key) {
        this.key = key;
    }
}
