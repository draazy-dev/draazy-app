package com.draazy.api.finance.ledger;

public final class TransactionTypes {
    private TransactionTypes() {
    }

    public static final String INCOME = "income";

    public static final String EXPENSE = "expense";

    public static boolean isValid(String value) {
        return INCOME.equals(value) || EXPENSE.equals(value);
    }
}
