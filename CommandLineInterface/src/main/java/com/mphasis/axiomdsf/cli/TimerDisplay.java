package com.mphasis.axiomdsf.cli;

/**
 * Displays a live timer while an operation is in progress.
 * Uses carriage return to update the line in place.
 */
public class TimerDisplay {

    // Small trailing space buffer to overwrite leftover chars without exceeding terminal width
    private static final String TRAIL = "          ";

    private volatile boolean running;
    private Thread timerThread;
    private long startTime;

    /**
     * Start the timer display with the given message.
     */
    public void start(String message) {
        running = true;
        startTime = System.currentTimeMillis();
        
        timerThread = new Thread(() -> {
            while (running) {
                long elapsed = (System.currentTimeMillis() - startTime) / 1000;
                System.out.print("\r  [..] " + message + " [" + formatTime(elapsed) + "]" + TRAIL);
                System.out.flush();
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }, "timer-display");
        timerThread.setDaemon(true);
        timerThread.start();
    }

    /**
     * Stop the timer and return elapsed seconds.
     */
    public long stop() {
        running = false;
        long elapsed = (System.currentTimeMillis() - startTime) / 1000;
        if (timerThread != null) {
            timerThread.interrupt();
            try { timerThread.join(500); } catch (InterruptedException ignored) {}
        }
        System.out.print("\r  [OK] Completed in " + formatTime(elapsed) + TRAIL);
        System.out.println();
        return elapsed;
    }

    private String formatTime(long seconds) {
        if (seconds < 60) return seconds + "s";
        return (seconds / 60) + "m " + (seconds % 60) + "s";
    }
}
