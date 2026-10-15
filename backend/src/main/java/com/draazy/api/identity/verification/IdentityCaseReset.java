package com.draazy.api.identity.verification;

import java.util.UUID;

/** Published inside the transaction that discards a case's rejection (resubmit or withdraw). */
public record IdentityCaseReset(UUID verificationId) {
}
