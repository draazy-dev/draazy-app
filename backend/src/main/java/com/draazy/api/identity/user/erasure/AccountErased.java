package com.draazy.api.identity.user.erasure;

import java.util.UUID;

/** Published inside the erasure transaction, before the users row is pseudonymised, so a listener
 * can still read the account and its failure rolls the erasure back. */
public record AccountErased(UUID userId) {
}
