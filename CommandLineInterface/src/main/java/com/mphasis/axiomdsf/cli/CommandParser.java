package com.mphasis.axiomdsf.cli;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses a single-line command string into a structured command with named arguments.
 *
 * Examples:
 *   "workspace create --name MyProject --desc A description --tech Java"
 *   "workflow start --workspace 1 --text Build a REST API"
 *   "workflow status --workspace 1 --requirement 1"
 */
public class CommandParser {

    private static final Logger logger = LoggerFactory.getLogger(CommandParser.class);

    private final String group;        // e.g., "workspace", "workflow"
    private final String action;       // e.g., "create", "start", "status"
    private final Map<String, String> args;  // e.g., {name=MyProject, desc=...}

    private CommandParser(String group, String action, Map<String, String> args) {
        this.group = group;
        this.action = action;
        this.args = args;
    }

    public String getGroup() { return group; }
    public String getAction() { return action; }

    public String getArg(String key) {
        return args.get(key.toLowerCase());
    }

    public String requireArg(String key) {
        String value = args.get(key.toLowerCase());
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required argument: --" + key);
        }
        return value;
    }

    public Long requireLongArg(String key) {
        String value = requireArg(key);
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Argument --" + key + " must be a number, got: " + value);
        }
    }

    public int requireIntArg(String key) {
        String value = requireArg(key);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Argument --" + key + " must be an integer, got: " + value);
        }
    }

    public boolean hasArg(String key) {
        return args.containsKey(key.toLowerCase());
    }

    /**
     * Parse a raw command line into a CommandParser instance.
     * Supports quoted strings and --key value pairs.
     */
    public static CommandParser parse(String line) {
        List<String> tokens = tokenize(line);

        if (tokens.isEmpty()) {
            throw new IllegalArgumentException("Empty command");
        }

        // Single-word commands like "help", "exit"
        if (tokens.size() == 1) {
            return new CommandParser(tokens.get(0).toLowerCase(), "", Collections.emptyMap());
        }

        String group = tokens.get(0).toLowerCase();
        String action = tokens.get(1).toLowerCase();

        Map<String, String> args = new LinkedHashMap<>();
        int i = 2;
        while (i < tokens.size()) {
            String token = tokens.get(i);
            if (token.startsWith("--")) {
                String key = token.substring(2).toLowerCase();
                StringBuilder valueBuilder = new StringBuilder();
                i++;
                // Collect all tokens until the next --flag as the value
                while (i < tokens.size() && !tokens.get(i).startsWith("--")) {
                    if (valueBuilder.length() > 0) {
                        valueBuilder.append(" ");
                    }
                    valueBuilder.append(tokens.get(i));
                    i++;
                }
                args.put(key, valueBuilder.toString());
            } else {
                i++;
            }
        }

        logger.debug("Parsed command - group: {}, action: {}, args: {}", group, action, args);
        return new CommandParser(group, action, args);
    }

    /**
     * Tokenize the input line, respecting quoted strings.
     */
    private static List<String> tokenize(String line) {
        List<String> tokens = new ArrayList<>();
        Pattern pattern = Pattern.compile("\"([^\"]*)\"|'([^']*)'|(\\S+)");
        Matcher matcher = pattern.matcher(line.trim());
        while (matcher.find()) {
            if (matcher.group(1) != null) {
                tokens.add(matcher.group(1));
            } else if (matcher.group(2) != null) {
                tokens.add(matcher.group(2));
            } else {
                tokens.add(matcher.group(3));
            }
        }
        return tokens;
    }
}
