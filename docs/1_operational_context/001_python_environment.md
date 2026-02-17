# Operational Context: Python Server & MCP

## 1. Environment Requirements
*   **Python:** 3.10 or higher.
*   **Dependencies:** Added `flask-sock` for WebSocket support.
    *   `pip install -r requirements.txt`

## 2. Server Configuration
*   **Port:** Defaults to `5010`. Configurable via `.env` (`FLASK_RUN_PORT`).
*   **Host:** Defaults to `127.0.0.1` (Local). Configurable via `.env` (`FLASK_RUN_HOST`).
*   **WebSocket Route:** `/ws` (Used internally by the extension).
*   **MCP Endpoint:** `/mcp/prompt` (POST).

## 3. Usage Modes
The server now supports three operational modes, toggled via the extension UI:
1.  **Normal:** Standard HTTP endpoints for context/deploy.
2.  **Agent:** Adds auto-deploy capabilities.
3.  **MCP:** Establishes the WebSocket connection. The extension icon/button usually turns green to indicate the active link.

## 4. Security Notes
*   **Network Exposure:** If `FLASK_RUN_HOST` is set to `0.0.0.0` or a LAN IP, the `/mcp/prompt` endpoint is exposed to the network.
*   **Code Execution:** While `/mcp/prompt` mainly *retrieves* text, the resulting text might contain code that a subsequent tool could execute. Standard caution applies.
