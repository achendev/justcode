# [002] Push-to-Talk Dictation via ChatGPT & WebSocket Bridge

**Status:** Implemented

## 1. Problem & Context
Users want hands-free push-to-talk voice dictation into any application (IDE, browser, terminal) using ChatGPT's high-accuracy Whisper voice recognition without paying for third-party tools or separate transcription APIs.

## 2. The Solution
1. **Python Server Daemon (`server/tools/dictation_daemon.py`):**
   - Uses `pynput` to listen for a global hotkey press/release (default: `Key.cmd_r` on macOS, `Key.ctrl_r` on Windows/Linux).
   - On **KeyDown**: Records the frontmost application and broadcasts `dictation_start` to the Chrome extension via WebSocket.
   - On **KeyUp**: Broadcasts `dictation_stop`.
2. **Chrome Extension (`chatgpt_dictation.js` & `dictation_handler.js`):**
   - Locates the open ChatGPT tab (`chatgpt.com`).
   - Clicks the microphone button to start audio streaming.
   - On stop, clicks the stop button, polls `#prompt-textarea` for the finalized transcription, clears the input area, and returns the text over the WebSocket.
3. **Restoration & Paste:**
   - Python receives the transcript, reactivates the saved origin window via AppleScript, and performs a native clipboard paste (`Cmd+V` / `Ctrl+V`).

## 3. UI Controls
- Click the microphone icon in the JustCode popup header to designate any open ChatGPT tab as the active dictation worker.