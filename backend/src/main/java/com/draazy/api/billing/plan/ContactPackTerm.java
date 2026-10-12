package com.draazy.api.billing.plan;

import java.time.Instant;

/** One paid contact pack: {@code capacity} contacts usable from {@code from} until {@code until}. */
public record ContactPackTerm(Instant from, Instant until, int capacity) {
}
