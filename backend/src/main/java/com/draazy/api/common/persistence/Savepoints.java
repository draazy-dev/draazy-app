package com.draazy.api.common.persistence;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Savepoint;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.Assert;

// Savepoint per batch item: the transaction manager refuses NESTED and REQUIRES_NEW cannot see uncommitted rows.
// JPA writes inside must flush before returning, or a rollback to the savepoint misses them.
public final class Savepoints {
    private Savepoints() {
    }

    public static void isolated(DataSource dataSource, Runnable work) {
        Assert.state(TransactionSynchronizationManager.isActualTransactionActive(),
                "Savepoints.isolated needs an active transaction");
        Connection con = DataSourceUtils.getConnection(dataSource);
        try {
            Savepoint savepoint = con.setSavepoint();
            try {
                work.run();
                con.releaseSavepoint(savepoint);
            } catch (RuntimeException e) {
                con.rollback(savepoint);
                throw e;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Savepoint failed", e);
        } finally {
            DataSourceUtils.releaseConnection(con, dataSource);
        }
    }
}
