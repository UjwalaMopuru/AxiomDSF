package com.mphasis.axiomdsf.cli;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Utility for printing API responses in a formatted manner,
 * similar to how Swagger UI displays responses.
 */
public class ResponsePrinter {

    private static final Logger logger = LoggerFactory.getLogger(ResponsePrinter.class);

    /**
     * Print a full API response with status code and formatted body.
     * Use this for error responses or when full detail is needed.
     */
    public static void printResponse(ApiClient apiClient, ApiClient.ApiResponse response) {
        logger.debug("Printing response - status: {}, success: {}", response.getStatusCode(), response.isSuccess());
        System.out.println();

        if (response.getStatusCode() == -1) {
            // Connection error
            System.out.println("┌─── CONNECTION ERROR ───────────────────────────────");
            System.out.println("│ " + response.getBody().replace("\n", "\n│ "));
            System.out.println("└────────────────────────────────────────────────────");
            return;
        }

        String statusLabel = getStatusLabel(response.getStatusCode());
        String border = response.isSuccess() ? "SUCCESS" : "ERROR";

        System.out.println("┌─── " + border + " [HTTP " + response.getStatusCode() + " " + statusLabel + "] ───");
        System.out.println("│");

        String body = response.getBody();
        if (body != null && !body.isBlank()) {
            String pretty = apiClient.prettyPrint(body);
            for (String line : pretty.split("\n")) {
                System.out.println("│  " + line);
            }
        } else {
            System.out.println("│  (empty response)");
        }

        System.out.println("│");
        System.out.println("└────────────────────────────────────────────────────");
    }

    /**
     * Print a concise success summary with only key fields.
     * On success, shows a short message; on failure, falls back to full response.
     */
    public static void printSuccessSummary(ApiClient apiClient, ApiClient.ApiResponse response,
                                            String commandLabel, Map<String, String> keyFields) {
        if (!response.isSuccess()) {
            logger.debug("Success summary fallback to full response for: {}", commandLabel);
            printResponse(apiClient, response);
            return;
        }

        System.out.println();
        System.out.println("┌─── " + commandLabel + " ───");
        for (Map.Entry<String, String> entry : keyFields.entrySet()) {
            System.out.println("│  " + entry.getKey() + " : " + entry.getValue());
        }
        System.out.println("└────────────────────────────────────────────────────");
    }

    private static String getStatusLabel(int statusCode) {
        switch (statusCode) {
            case 200: return "OK";
            case 201: return "Created";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 500: return "Internal Server Error";
            default: return "";
        }
    }
}
