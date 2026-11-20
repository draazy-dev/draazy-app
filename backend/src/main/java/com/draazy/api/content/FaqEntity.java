package com.draazy.api.content;

import com.draazy.api.common.persistence.SoftDeleteEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "faqs")
@Getter
public class FaqEntity extends SoftDeleteEntity {
    @Column(name = "question", nullable = false)
    private String question;

    @Column(name = "answer")
    private String answer;

    @Column(name = "category")
    private String category;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "translations", nullable = false)
    private Map<String, Map<String, String>> translations = new LinkedHashMap<>();

    protected FaqEntity() {}

    void apply(ContentWrite w) {
        if (w.question() != null) { this.question = w.question(); }
        if (w.answer() != null) { this.answer = w.answer(); }
        if (w.category() != null) { this.category = w.category(); }
        if (w.translations() != null) { this.translations = w.translations(); }
    }
}
