# Support: [Symptom / Topic]

## 1. Symptom Description
*   **User Report:** "The app does X when I click Y."
*   **Log Output:** `Error: 403 Forbidden...`

## 2. Root Cause Analysis
*   **Cause:** The permissions were revoked by the OS update.
*   **Why it wasn't caught:** The check runs only on startup, not continuously.

## 3. Diagnosis Steps
1.  Check if `Accessibility` is enabled in System Settings.
2.  Tail the logs: `tail -f ~/tmp/fineterm_debug.log`.
3.  Verify process ID matches...

## 4. Resolution / Workaround
*   **Fix:** Restart the app.
*   **Code Fix:** See PR #123 (Implemented auto-reconnect).

## 5. Performance Notes
*   **Thresholds:** This function slows down if > 1000 items.
*   **Optimization:** Use lazy loading for the list.
