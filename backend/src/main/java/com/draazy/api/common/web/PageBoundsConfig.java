package com.draazy.api.common.web;

import com.draazy.api.common.error.BadRequestException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Spring Data caps the page size but not the page number; past this bound page × size overflows the int offset
 * every repository pages with, and the request would 500 instead of being refused. */
@Configuration
public class PageBoundsConfig implements WebMvcConfigurer {

    private static final int MAX_PAGE = 10_000;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (beyondLastPage(request.getParameter("page"))) {
                    throw new BadRequestException("page must be at most " + MAX_PAGE);
                }
                return true;
            }
        });
    }

    private static boolean beyondLastPage(String page) {
        if (page == null) {
            return false;
        }
        try {
            return Integer.parseInt(page) > MAX_PAGE;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
