package com.draazy.api.common.config;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** A Postgres advisory lock per job, held in one open transaction for the whole run: one instance runs it.
 * Transaction-scoped so a transaction-mode pooler (DB_URL on :6543) keeps the run pinned to one backend. */
final class JobLock {

    private static final Logger log = LoggerFactory.getLogger(JobLock.class);

    private final DataSource dataSource;

    JobLock(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /** The held lock, or empty when another instance holds it or the database cannot be asked. */
    Optional<Held> tryAcquire(String job) {
        Connection connection = null;
        try {
            connection = dataSource.getConnection();
            connection.setAutoCommit(false);
            if (tryLock(connection, job)) {
                return Optional.of(new Held(connection));
            }
        } catch (SQLException e) {
            log.warn("Could not take the advisory lock for job {}: {}", job, e.getMessage());
        }
        release(connection);
        return Optional.empty();
    }

    private static boolean tryLock(Connection connection, String job) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_try_advisory_xact_lock(hashtext(?))")) {
            statement.setString(1, job);
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        }
    }

    private static void release(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            connection.rollback();
            connection.close();
        } catch (SQLException e) {
            log.warn("Could not end the job-lock transaction; dropping its connection: {}", e.getMessage());
            try {
                connection.abort(Runnable::run);
            } catch (SQLException ignored) {
                log.debug("Aborting the job-lock connection failed: {}", ignored.getMessage());
            }
        }
    }

    static final class Held implements AutoCloseable {

        private final Connection connection;

        private Held(Connection connection) {
            this.connection = connection;
        }

        @Override
        public void close() {
            release(connection);
        }
    }
}
