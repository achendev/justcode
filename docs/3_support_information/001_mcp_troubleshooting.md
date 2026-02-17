# Support: MCP & API Mode Troubleshooting

## 1. Symptom: "Error: JustCode Chrome Extension is not connected"
*   **Description:** You run a curl command, but the server immediately rejects it.
*   **Cause:** The WebSocket connection is dropped or wasn't established.
*   **Fix:**
    1.  Open the JustCode popup.
    2.  Toggle the Agent Mode button until it is **Green**.
    3.  Ensure the status message says "MCP Connected".
    4.  Ensure the Google AI Studio tab is open.

## 2. Symptom: Curl hangs / Timeout (504)
*   **Description:** The request waits for 5 minutes and then errors out.
*   **Cause:** The LLM never finished generating, or the extension failed to detect the "Finish" state.
*   **Diagnosis:** Look at the Chrome tab.
    *   *Is it still typing?* -> The model is slow.
    *   *Has it finished but JustCode didn't notice?* -> The DOM selector for the "Stop" button might be outdated.
*   **Fix:** Check `mcp_handler.js` logic regarding `waitForGenerationToFinish`.

## 3. Symptom: "Error: Could not extract answer"
*   **Description:** The LLM replied, but the API returned an error string.
*   **Cause:** The complex UI of AI Studio hid the text structure JustCode expects.
*   **Fix:** This usually triggers the "Raw Mode" fallback. If that fails, the `robust_fallback_handlers` selectors might need updating to match recent AI Studio UI changes (e.g., new class names for the menu buttons).

## 4. Feature: Context Awareness
*   **Behavior:** The first request takes longer (uploading context). Subsequent requests are fast.
*   **Resetting:** If you *want* to re-upload context (e.g., you changed files), simply **reload the web page**. This clears the injected `window.justCodeContextSent` flag.
