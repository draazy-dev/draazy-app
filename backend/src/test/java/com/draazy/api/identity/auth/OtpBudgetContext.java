package com.draazy.api.identity.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@SpringBootTest(properties = {
    "draazy.otp.max-platform-sends-per-window=" + OtpBudgetContext.PLATFORM_CAP,
    "draazy.otp.max-purpose-sends-per-window=" + OtpBudgetContext.PURPOSE_CAP,
    "draazy.otp.send-cooldown-seconds=0",
})
@AutoConfigureMockMvc
@interface OtpBudgetContext {
    int PLATFORM_CAP = 6;
    int PURPOSE_CAP = 4;
}
