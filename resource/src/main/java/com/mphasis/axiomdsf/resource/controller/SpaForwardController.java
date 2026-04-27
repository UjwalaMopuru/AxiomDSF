package com.mphasis.axiomdsf.resource.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Forwards all non-API, non-static-resource routes to Angular's index.html
 * so that client-side routing works when the SPA is served by Spring Boot.
 */
@Controller
public class SpaForwardController {

    @GetMapping({
        "/dashboard",
        "/dashboard/**",
        "/workspaces",
        "/workspaces/**",
        "/workflow",
        "/workflow/**"
    })
    public String forward() {
        return "forward:/index.html";
    }
}
