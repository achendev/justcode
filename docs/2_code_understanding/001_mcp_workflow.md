# [001] MCP Workflow & Logic Flow

## 1. Summary
This document explains how a request travels from an external tool, through the JustCode system, to Google AI Studio, and back.

## 2. Logic Flow / Mental Model

### A. Connection Phase
1.  User selects **MCP Mode** in the extension popup.
2.  `background.js` initiates a WebSocket connection to `ws://localhost:5010/ws`.
3.  `app.py` accepts the connection and adds it to `ws_connections` list.
4.  UI indicator turns **Green**.

### B. Execution Phase
1.  **External Request:** `curl -X POST /mcp/prompt -d '{"prompt": "Hello"}'` hits `app.py`.
2.  **Bridge:** `app.py` generates a `req_id`, creates a `threading.Event`, and sends a JSON payload `{type: 'mcp_request', ...}` down the WebSocket. It then pauses the HTTP request thread (`event.wait()`).
3.  **Extension Routing:** `background.js` receives the WS message. It calls `handleMcpRequest` in `mcp_handler.js` (injected into the page context).
4.  **Context Awareness:**
    *   `mcp_handler.js` checks `window.justCodeContextSent`.
    *   **If False:** Fetches context from Python (`/getcontext`), saves it to a temporary file object, uploads it to the DOM input, and marks the flag as True.
    *   **If True:** Skips upload to save time/tokens.
5.  **Prompt Injection:** The user's prompt is pasted into the input field.
6.  **Submission:** The "Run" button is programmatically clicked.
7.  **Polling:** The script polls the DOM (checking for the Stop button or spinner) to determine when generation starts and ends.
8.  **Extraction (Robust):**
    *   Once finished, `mcp_handler` attempts to extract text.
    *   **AI Studio Specific:** If simple extraction fails or yields empty text, it triggers `robust_fallback_handlers/aistudio.js`. This script opens the "Three Dots" menu and toggles "Raw Mode" (Markdown view) to bypass complex DOM rendering.
    *   The raw text is extracted.
    *   Raw mode is reverted.
9.  **Return Trip:** The answer is returned to `background.js`, which sends it via WebSocket `{type: 'mcp_response', ...}` to Python.
10. **Completion:** `app.py` wakes up the waiting HTTP thread and returns the answer to `curl`.

## 3. Key Classes & Files
| File | Role |
| :--- | :--- |
| `app.py` | Flask server, WebSocket host, HTTP-to-WS bridge. |
| `js/mcp_handler.js` | The "Brain" inside the tab. Orchestrates the UI automation sequence. |
| `js/background.js` | The "Network Manager". Holds the persistent WS connection. |
| `js/deploy_code/robust_fallback_handlers/aistudio.js` | UI Hacking. Toggles menus to expose raw text. |

## 4. Gotchas & Edge Cases
*   **Tab Focus:** Chrome creates hiccups if the target tab is discarded (sleeping) to save memory. Ideally, the tab should be active.
*   **Race Conditions:** If the user manually types in the box while MCP is running, the state machine might get confused.
*   **"Stop" Button Flicker:** Sometimes the stop button disappears briefly during network lag in generation. The polling logic has a stabilization delay (`setTimeout`) to ensure it's truly finished.
