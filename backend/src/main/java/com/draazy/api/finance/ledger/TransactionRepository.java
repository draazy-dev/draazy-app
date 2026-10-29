package com.draazy.api.finance.ledger;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {
    @Query(value = "select t from Transaction t where t.propertyId = :propertyId and t.archived = false "
            + "order by t.date desc, t.createdAt desc",
            countQuery = "select count(t) from Transaction t where t.propertyId = :propertyId "
                    + "and t.archived = false")
    Page<Transaction> findLiveByPropertyId(@Param("propertyId") UUID propertyId, Pageable pageable);

    @Query("select t from Transaction t where t.id = :id and t.propertyId = :propertyId "
            + "and t.archived = false")
    Optional<Transaction> findLiveByIdAndPropertyId(@Param("id") UUID id,
                                                    @Param("propertyId") UUID propertyId);

    @Query("select t from Transaction t where t.propertyId = :propertyId and t.archived = false "
            + "and t.recurring <> 'none' order by t.date")
    List<Transaction> findLiveRecurringByPropertyId(@Param("propertyId") UUID propertyId);

    @Query("select "
            + "coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0) as income, "
            + "coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0) as expense "
            + "from Transaction t where t.propertyId = :propertyId and t.archived = false "
            + "and (cast(:from as LocalDate) is null or t.date >= :from)")
    Totals sumByTypeSince(@Param("propertyId") UUID propertyId, @Param("from") LocalDate from);

    interface Totals {
        long getIncome();

        long getExpense();
    }

    @Query("select function('to_char', t.date, 'YYYY-MM'), "
            + "coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0), "
            + "coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0) "
            + "from Transaction t where t.propertyId = :propertyId and t.archived = false "
            + "and t.date >= :from and t.date < :toExclusive "
            + "group by function('to_char', t.date, 'YYYY-MM') "
            + "order by function('to_char', t.date, 'YYYY-MM')")
    List<Object[]> monthlyTotalsBetween(@Param("propertyId") UUID propertyId,
                                        @Param("from") LocalDate from,
                                        @Param("toExclusive") LocalDate toExclusive);
}
