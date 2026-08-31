# [002] Push-to-Talk Dictation Workflow & Subsystem

## 1. Summary
The Push-to-Talk Dictation feature turns a dedicated ChatGPT browser tab into an OS-wide input transcription service. Users can speak from any application and have their speech transcribed by Whisper and pasted directly at their cursor.

## 2. Logic Flow / Mental Model

```
[ User Holds Hotkey: Right ⌘ (Background) or Right ⌥ (Foreground) ]
       │
       ▼
 [ Python DictationDaemon ]
   1. Captures frontmost App Name & Bundle ID (e.g. "ghostty" / "com.mitchellh.ghostty")
   2. Sends WebSocket { type: 'dictation_start', switchOnStart: (mode == 'foreground') }
       │
       ▼
 [ Chrome Extension Background (dictation_handler.js) ]
   1. Saves currently active Chrome Tab ID (if currently in Chrome)
   2. If Foreground: Switches Chrome window/tab to ChatGPT
   3. Injects start command into ChatGPT tab (chatgpt_dictation.js)
   4. Clicks Dictation mic button (synthetic pointer/mouse events)
       │
[ User Releases Hotkey ]
       │
       ▼
 [ Python DictationDaemon ]
   1. Sends WebSocket { type: 'dictation_stop' }
       │
       ▼
 [ Chrome Extension (chatgpt_dictation.js) ]
   1. Clicks Stop in ChatGPT
   2. Focuses prompt container; MutationObserver waits for Whisper output
   3. Detects text in #prompt-textarea/p (up to 45s safety timeout, instant 80ms resolution)
   4. Extracts text and clears prompt area
   5. dictation_handler.js restores previously active Chrome tab (if any)
   6. Sends WebSocket { type: 'dictation_result', text: "..." }
       │
       ▼
 [ Python DictationDaemon ]
   1. Receives transcript text
   2. Copies text to system clipboard
   3. Reactivates target app (tell application id "<bundle_id>" to activate)
   4. Injects key code 9 using command down (Cmd+V) at the cursor
```

## 3. Key Classes & Files
| File | Role |
| :--- | :--- |
| `server/tools/dictation_daemon.py` | Global key listener (`pynput`), active window memory, and AppleScript focus/paste injector. |
| `server/dictation_endpoint.py` | HTTP control endpoints for status and manual triggers. |
| `chrome_extension/js/dictation_handler.js` | Background coordinator. Resolves dedicated tab, manages tab state/restoration, and handles mode switching. |
| `chrome_extension/js/content_script/chatgpt_dictation.js` | Injected ChatGPT DOM driver. Handles microphone clicks, text extraction from `#prompt-textarea/p`, and prompt clearing. |
| `chrome_extension/popup.html` | Top navigation bar microphone icon to pair the dedicated ChatGPT tab. |

## 4. Gotchas & Edge Cases
*   **Supervisor Reloader Duplication:** In Flask debug mode, the Werkzeug supervisor process re-runs module initialization. `DictationDaemon` checks `if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':` so key listeners only start in the active worker process.
*   **Qt / Telegram Accelerator Parsing:** Standard `keystroke "v"` fails in Qt/Electron apps when modifiers are stripped during rapid window switching. `key code 9 using command down` injects the raw hardware virtual keycode for `V`, guaranteeing paste across all applications and non-US keyboard layouts.
*   **Long Dictations:** Whisper takes several seconds for long audio chunks. The extraction timeout is set to 45 seconds so long dictations are never abandoned prematurely.