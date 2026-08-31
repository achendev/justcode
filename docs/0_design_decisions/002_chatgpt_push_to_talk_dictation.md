# [002] Push-to-Talk Dictation via Dedicated ChatGPT Tab

**Status:** Implemented
**Last Updated:** 2026-08-31

## 1. Problem & Context
Users want system-wide push-to-talk voice dictation that works seamlessly across all applications (terminal, IDE, browsers, text editors) without paying for third-party subscription software or separate transcription APIs.

**Constraints:**
1.  **No API Keys / Zero Cost:** Leverage the existing free web interface of ChatGPT (Whisper model) in a browser tab.
2.  **Unobtrusive Speech Experience:** The user should not have their screen hijacked or window focus stolen while actively holding the hotkey and speaking.
3.  **Cross-App Restoration:** Dictation started from any app (Ghostty, Terminal, VS Code, or another Chrome tab) must paste directly into that origin context and restore the user's workspace state automatically.
4.  **Background Tab Throttling:** Chrome suspends audio capture and throttles timers (`setInterval`) down to 1000ms+ in background tabs unless specifically handled.

## 2. The Solution
We implemented an event-driven push-to-talk pipeline coordinating the local Python server daemon and the Chrome extension via the existing WebSocket bridge with two operational modes:

### Modes of Operation:
1.  **Background Mode (Hold Right ⌘ / `cmd_r`):**
    *   User stays in their active application (Ghostty, Terminal, IDE, Chrome on Google) while speaking.
    *   On release, the extension briefly brings the ChatGPT tab to focus, extracts the text, restores the original tab/app, and pastes the text at the cursor.
2.  **Foreground Mode (Hold Right ⌥ / `alt_r`):**
    *   Immediately brings the ChatGPT tab to the front on key-down so the user can see the prompt area and text during long dictations.
    *   On release, finalizes transcription, restores the previous active app/tab, and pastes the text.

### Architecture & Data Flow
1.  **Python Server Daemon (`server/tools/dictation_daemon.py`):**
    *   Listens for global key events via `pynput`.
    *   Guarded against Werkzeug supervisor process duplication (`WERKZEUG_RUN_MAIN == 'true'`).
    *   **On KeyDown:**
        *   Captures the frontmost application process name and unique macOS Bundle ID (`com.mitchellh.ghostty`, `com.google.Chrome`, etc.).
        *   Broadcasts `dictation_start` with `switchOnStart: false` (Background) or `switchOnStart: true` (Foreground) via WebSocket.
    *   **On KeyUp:**
        *   Broadcasts `dictation_stop`.
        *   Awaits the transcribed text payload (`dictation_result`).
        *   Reactivates the original application via AppleScript (`tell application id "<bundle_id>" to activate`) and injects `key code 9 using command down` (hardware virtual key for `V`).
2.  **Chrome Extension Background Coordinator (`dictation_handler.js`):**
    *   Maintains the active/dedicated ChatGPT tab reference.
    *   **On Start:** Records the user's currently active Chrome tab (if in Chrome) and triggers dictation start without switching tabs (unless in Foreground mode).
    *   **On Stop:** Temporarily activates the ChatGPT tab to bypass Chrome background execution throttling, executes the stop/extraction sequence, restores the previous Chrome tab, and returns the transcript over WebSocket.
3.  **Content Script Driver (`chatgpt_dictation.js`):**
    *   Clears `#prompt-textarea` prior to recording to ensure a 100% clean transcript.
    *   Simulates complete pointer/mouse event sequences (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) to trigger the mic/stop buttons without triggering browser focus stalls.
    *   Uses a native `MutationObserver` on `#prompt-textarea` and `<p>` child nodes with a high-frequency polling fallback to detect Whisper's output immediately.
    *   Extracts and cuts/clears the prompt text as soon as text arrives, resolving immediately.

## 3. Why this approach? (Pros/Cons)

### Pros
*   **Zero-Cost High-Quality Transcription:** Uses OpenAI's state-of-the-art Whisper engine directly through the ChatGPT web interface.
*   **Hands-Free Workspace Preservation:** The active application stays in front while speaking; tab state in Chrome is automatically remembered and restored.
*   **Instant Text Extraction:** Using `MutationObserver` eliminates timer throttling delays when extracting the transcript.
*   **Unified WebSocket Bridge:** Reuses the existing `/ws` connection from the MCP subsystem with a 15-second keepalive heartbeat.

### Cons
*   **Requires Open ChatGPT Tab:** One tab with `chatgpt.com` must remain open and logged in.
*   **DOM Selectors Dependency:** If OpenAI restructures the composer DOM buttons, selectors in `chatgpt_dictation.js` may need updates.

## 4. Revision History
*   **2026-08-27:** Initial implementation of single-hotkey push-to-talk dictation.
*   **2026-08-29:** Switched AppleScript to `key code 9` to support Telegram (Qt) and non-US keyboard layouts.
*   **2026-08-31:** Implemented dual-mode operation: Background (`cmd_r`) vs. Foreground (`alt_r`), Werkzeug supervisor duplicate listener guard, and extended 45-second Whisper transcription window.