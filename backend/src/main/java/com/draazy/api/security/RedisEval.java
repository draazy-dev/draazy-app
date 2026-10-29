package com.draazy.api.security;

import java.util.List;

@FunctionalInterface
public interface RedisEval {
    List<Long> eval(String script, List<String> keys, List<String> args);
}
