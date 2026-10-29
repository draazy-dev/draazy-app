package com.draazy.api.catalog.property;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

class PropertySearchFragmentImpl implements PropertySearchFragment {
    private final EntityManager em;

    PropertySearchFragmentImpl(EntityManager em) {
        this.em = em;
    }

    @Override
    public List<Property> findPage(Specification<Property> spec, Pageable pageable) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Property> cq = cb.createQuery(Property.class);
        Root<Property> root = cq.from(Property.class);
        cq.select(root);
        Predicate where = spec.toPredicate(root, cq, cb);
        if (where != null) {
            cq.where(where);
        }
        List<Order> orders = orders(pageable.getSort(), root, cb);
        if (!orders.isEmpty()) {
            cq.orderBy(orders);
        }
        return em.createQuery(cq)
                .setFirstResult((int) pageable.getOffset())
                .setMaxResults(pageable.getPageSize())
                .getResultList();
    }

    @Override
    public Totals countTotals(Specification<Property> spec, Specification<Property> verified,
            Specification<Property> unstated) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Tuple> cq = cb.createTupleQuery();
        Root<Property> root = cq.from(Property.class);
        Predicate where = spec.toPredicate(root, cq, cb);
        if (where != null) {
            cq.where(where);
        }
        Predicate isVerified = verified.toPredicate(root, cq, cb);
        Predicate isUnstated = unstated.toPredicate(root, cq, cb);
        cq.multiselect(cb.count(root),
                cb.sum(cb.<Long>selectCase().when(isVerified, 1L).otherwise(0L)),
                cb.sum(cb.<Long>selectCase().when(isUnstated, 1L).otherwise(0L)));
        Tuple row = em.createQuery(cq).getSingleResult();
        return new Totals(toLong(row.get(0)), toLong(row.get(1)), toLong(row.get(2)));
    }

    private static List<Order> orders(Sort sort, Root<Property> root, CriteriaBuilder cb) {
        return sort.stream()
                .map(o -> o.isAscending() ? cb.asc(root.get(o.getProperty())) : cb.desc(root.get(o.getProperty())))
                .map(Order.class::cast)
                .toList();
    }

    private static long toLong(Object value) {
        return value instanceof Number n ? n.longValue() : 0L;
    }
}
