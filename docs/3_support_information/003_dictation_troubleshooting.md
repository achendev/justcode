# Support: Push-to-Talk Dictation Troubleshooting

## 1. Symptom: "This process is not trusted! Input event monitoring will not be possible"
*   **Description:** When starting `./app.sh`, a warning appears regarding accessibility clients.
*   **Cause:** macOS requires both **Input Monitoring** and **Accessibility** permissions for terminal processes listening to global key events.
*   **Fix:**
    1.  Open **System Settings -> Privacy & Security -> Input Monitoring**.
    2.  Enable your terminal application (**Terminal**, **Ghostty**, or **iTerm**).
    3.  Open **System Settings -> Privacy & Security -> Accessibility** and ensure the terminal is enabled there as well.
    4.  Restart the terminal application (`Cmd+Q`) so permissions take effect.

## 2. Symptom: Dictation not starting / "No ChatGPT tab found"
*   **Description:** Holding the hotkey shows an error notification that no ChatGPT tab was found.
*   **Cause:** No tab with `chatgpt.com` is open, or the dedicated tab was closed.
*   **Fix:**
    1.  Open [chatgpt.com](https://chatgpt.com/) in Google Chrome and log in.
    2.  Click the JustCode extension icon in the toolbar.
    3.  Click the **Microphone icon** in the top menu bar to designate the current tab as the active dictation worker.

## 3. Symptom: Hotkey triggers twice / duplicate logs
*   **Description:** Console shows `[Dictation] Hotkey DOWN` twice per press.
*   **Cause:** Two listener threads were started (usually caused by running multiple server instances or running under an unguarded auto-reloader).
*   **Fix:** Ensure only one instance of `app.py` is running (`pkill -f app.py`). The daemon includes an automatic singleton guard (`DictationDaemon._started`).

## 4. Symptom: Text remains in ChatGPT input box after dictation
*   **Description:** Dictated text is pasted into the app, but remains inside ChatGPT's input box.
*   **Cause:** ChatGPT's React state did not register the input clearing event.
*   **Fix:** `chatgpt_dictation.js` dispatches synthetic `input` and `change` events after setting `innerHTML = '<p><br></p>'`. If OpenAI updates composer internals, verify `clearPrompt()` in `chatgpt_dictation.js`.