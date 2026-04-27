package com.mphasis.axiomdsf;

import java.util.concurrent.Executor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;

@SpringBootApplication
@EnableConfigurationProperties(AgentPipelineProperties.class)
public class AxiomDsfApplication {

	private static final Logger logger = LoggerFactory.getLogger(AxiomDsfApplication.class);

	public static void main(String[] args) {
		logger.info("Starting AxiomDsfApplication...");
		SpringApplication.run(AxiomDsfApplication.class, args);
	}

	@Bean
	public CommandLineRunner startupBanner(Environment env) {
		return args -> {
			String port = env.getProperty("server.port", "8080");
			String url = "http://localhost:" + port;
			System.out.println();
			System.out.println("=============================================================");
			System.out.println("     _          _                 ____  ____  _____          ");
			System.out.println("    / \\   __  _(_) ___  _ __ ___ |  _ \\/ ___||  ___|         ");
			System.out.println("   / _ \\  \\ \\/ / |/ _ \\| '_ ` _ \\| | | \\___ \\| |_           ");
			System.out.println("  / ___ \\  >  <| | (_) | | | | | | |_| |___) |  _|          ");
			System.out.println(" /_/   \\_\\/_/\\_\\_|\\___/|_| |_| |_|____/|____/|_|            ");
			System.out.println("                                                             ");
			System.out.println("  AI-Powered Software Development Factory                    ");
			System.out.println("=============================================================");
			System.out.println();
			System.out.println("  Application started successfully!");
			System.out.println("  Local:   " + url);
			System.out.println("  API:     " + url + "/swagger-ui.html");
			System.out.println("  Health:  " + url + "/api/health");
			System.out.println();
			System.out.println("=============================================================");
			System.out.println();
			logger.info("AxiomDSF is ready at {}", url);
		};
	}

	@Bean(name = "agentExecutor")
	public Executor agentExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setCorePoolSize(16);
		executor.setMaxPoolSize(32);
		executor.setQueueCapacity(100);
		executor.setThreadNamePrefix("agent-");
		executor.initialize();
		return executor;
	}

}
