package com.mphasis.axiomdsf.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * HTTP client that communicates with the Student API backend.
 * Wraps Java's built-in HttpClient for REST calls.
 */
public class ApiClient {

    private static final Logger logger = LoggerFactory.getLogger(ApiClient.class);

    private final String baseUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public ApiClient(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        logger.debug("ApiClient initialized with baseUrl: {}", this.baseUrl);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        this.objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    /**
     * Result of an API call containing status code and response body.
     */
    public static class ApiResponse {
        private final int statusCode;
        private final String body;

        public ApiResponse(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }

        public int getStatusCode() { return statusCode; }
        public String getBody() { return body; }

        public boolean isSuccess() { return statusCode >= 200 && statusCode < 300; }
    }

    /**
     * Send a POST request with a JSON body.
     */
    public ApiResponse post(String path, Object requestBody) {
        try {
            String json = objectMapper.writeValueAsString(requestBody);
            logger.info("POST {} | body length: {}", path, json.length());
            logger.debug("POST {} | body: {}", path, json);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            return new ApiResponse(response.statusCode(), response.body());

        } catch (IOException e) {
            return new ApiResponse(-1,
                    "Connection error: " + e.getMessage()
                            + "\nMake sure the backend server is running at " + baseUrl);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new ApiResponse(-1, "Request interrupted: " + e.getMessage());
        }
    }

    /**
     * Send a GET request.
     */
    public ApiResponse get(String path) {
        try {
            logger.info("GET {}", path);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            logger.info("GET {} | response status: {}", path, response.statusCode());
            logger.debug("GET {} | response body length: {}", path, response.body().length());
            return new ApiResponse(response.statusCode(), response.body());

        } catch (IOException e) {
            logger.error("GET {} | connection error: {}", path, e.getMessage(), e);
            return new ApiResponse(-1,
                    "Connection error: " + e.getMessage()
                            + "\nMake sure the backend server is running at " + baseUrl);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("GET {} | request interrupted: {}", path, e.getMessage(), e);
            return new ApiResponse(-1, "Request interrupted: " + e.getMessage());
        }
    }

    /**
     * Pretty-print a JSON response string.
     */
    public String prettyPrint(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
        } catch (Exception e) {
            return json;
        }
    }
}
