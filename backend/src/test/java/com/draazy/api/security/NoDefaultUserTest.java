package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;

@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("No default Spring Security user — its password would be printed to the boot log")
class NoDefaultUserTest {
    @Autowired
    ApplicationContext context;

    @Test
    void thereIsNoUserDetailsService() {
        assertThat(context.getBeanNamesForType(UserDetailsService.class)).isEmpty();
    }
}
