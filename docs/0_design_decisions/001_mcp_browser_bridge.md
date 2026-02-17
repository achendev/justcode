# [001] MCP via Browser-WebSocket Bridge

**Status:** Implemented

## 1. Problem & Context
We want to enable the Model Context Protocol (MCP) for JustCode. This allows external tools (IDEs, agents, CLI scripts) to use JustCode as a "server" to query the LLM with the full project context.

**Constraints:**
1.  **No Direct API Key:** JustCode is designed to work with the *web interface* of LLMs (like Google AI Studio) to leverage free tiers, existing sessions, and large context windows without managing API keys or costs directly.
2.  **Context Management:** The "Project Context" resides on the local file system (managed by JustCode), but the "Intelligence" resides in the browser session.
3.  **Latency:** The feedback loop needs to be reasonably fast, though synchronous HTTP-like behavior is expected by MCP clients.

## 2. The Solution
We implemented a **Bidirectional WebSocket Bridge** between the local Python Server and the Chrome Extension.

### Architecture
1.  **External Client (curl/MCP):** Sends a standard HTTP POST request to the local Python server (e.g., `/mcp/prompt`).
2.  **Python Server:** Holds this HTTP request open (pending). It forwards the payload via an active WebSocket connection to the Chrome Extension.
3.  **Chrome Extension:**
    *   Receives the prompt.
    *   Checks if project context was already uploaded to the active tab. If not, fetches it from the Python server and uploads it as a file.
    *   Pastes the prompt into the LLM web UI.
    *   Automates the "Send" click.
    *   Polls the DOM to detect when generation finishes.
    *   Extracts the full text response (toggling "Raw Mode" if necessary to get clean Markdown).
    *   Sends the response back to Python via WebSocket.
4.  **Python Server:** Receives the response and sends it back as the HTTP response to the original client.

## 3. Why this approach? (Pros/Cons)

### Pros
*   **Zero-Config Auth:** Leverages the user's existing login state in the browser.
*   **Cost Efficiency:** Usage falls under the web interface tiers (often free/generous) rather than API billing.
*   **Context Consistency:** Uses the exact same context generation logic and exclusion rules as the manual plugin workflow.
*   **Visual Debugging:** The user can watch the browser tab to see exactly what the "Agent" is doing and intervene if it hallucinates.

### Cons
*   ** fragility:** Relies on DOM selectors (`ms-run-button`, `chat-turn-container`) which can break if the LLM provider updates their UI.
*   **Requirement:** Requires the browser tab to be open and active.
*   **Concurrency:** Can effectively handle only one request at a time (serializing usage of the active tab).

## 4. Alternatives Considered
*   **Direct API Integration:** Rejected because it defeats the purpose of JustCode (bridging local env to *web* UI).
*   **Headless Browser (Puppeteer/Selenium):** Rejected because managing authentication (2FA, cookies) in a headless instance is difficult and fragile compared to just using the user's already-open browser.
