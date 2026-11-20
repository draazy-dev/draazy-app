package com.draazy.api.finance.ledger;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeFinancesController {
    private final FinanceService financeService;

    public MeFinancesController(FinanceService financeService) {
        this.financeService = financeService;
    }

    @GetMapping(Routes.Finances.TRANSACTIONS)
    public PageResponse<TransactionDto> listTransactions(@CurrentUser AuthPrincipal principal,
                                                 @PathVariable("propId") String propId,
                                                 @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(
                financeService.listTransactions(
                        principal.userId(), parseUuid(propId), Pageables.unsorted(pageable)),
                dto -> dto);
    }

    @PostMapping(Routes.Finances.TRANSACTIONS)
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionDto addTransaction(@CurrentUser AuthPrincipal principal,
                                         @PathVariable("propId") String propId,
                                         @Valid @RequestBody TransactionCreateRequest body) {
        return financeService.addTransaction(principal.userId(), parseUuid(propId), body);
    }

    @PatchMapping(Routes.Finances.TRANSACTION_BY_ID)
    public TransactionDto updateTransaction(@CurrentUser AuthPrincipal principal,
                                            @PathVariable("propId") String propId,
                                            @PathVariable("txnId") String txnId,
                                            @Valid @RequestBody TransactionUpdateRequest body) {
        return financeService.updateTransaction(
                principal.userId(), parseUuid(propId), parseTxnUuid(txnId), body);
    }

    @DeleteMapping(Routes.Finances.TRANSACTION_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTransaction(@CurrentUser AuthPrincipal principal,
                                  @PathVariable("propId") String propId,
                                  @PathVariable("txnId") String txnId) {
        financeService.deleteTransaction(
                principal.userId(), parseUuid(propId), parseTxnUuid(txnId));
    }

    @PutMapping(Routes.Finances.BASIS)
    public OwnershipBasisDto setBasis(@CurrentUser AuthPrincipal principal,
                                      @PathVariable("propId") String propId,
                                      @Valid @RequestBody OwnershipBasisDto body) {
        return financeService.setBasis(principal.userId(), parseUuid(propId), body);
    }

    @GetMapping(Routes.Finances.SUMMARY)
    public FinanceSummaryDto summary(@CurrentUser AuthPrincipal principal,
                                     @PathVariable("propId") String propId,
                                     @RequestParam(value = "period", required = false)
                                     String period) {
        return financeService.summary(principal.userId(), parseUuid(propId), period);
    }

    @GetMapping(Routes.Finances.OVERVIEW)
    public FinanceOverviewDto overview(@CurrentUser AuthPrincipal principal,
                                       @PathVariable("propId") String propId,
                                       @RequestParam(value = "months", required = false)
                                       Integer months) {
        return financeService.overview(principal.userId(), parseUuid(propId), months);
    }

    private static UUID parseUuid(String token) {
        return Ids.parseUuid(token).orElseThrow(() -> NotFoundException.of("Property"));
    }

    private static UUID parseTxnUuid(String token) {
        return Ids.parseUuid(token)
                .orElseThrow(() -> NotFoundException.of("Transaction"));
    }
}
