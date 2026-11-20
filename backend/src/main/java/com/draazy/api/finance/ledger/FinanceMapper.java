package com.draazy.api.finance.ledger;

import java.time.LocalDate;
import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface FinanceMapper {
    TransactionDto toDto(Transaction transaction);

    @Mapping(target = "nextDue", source = "nextDue")
    @Mapping(target = "daysUntil", source = "daysUntil")
    DueDto toDueDto(Transaction transaction, LocalDate nextDue, long daysUntil);

    OwnershipBasisDto toDto(OwnershipBasis basis);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }
}
