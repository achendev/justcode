import os
import sys
import time
import threading
import subprocess
import platform
import pyperclip
from pynput import keyboard

class DictationDaemon:
    _started = False

    def __init__(self, ws_broadcast_func):
        self.ws_broadcast = ws_broadcast_func
        self.is_recording = False
        self.saved_app_name = None
        self.saved_bundle_id = None
        self.listener = None
        self.lock = threading.Lock()
        
        # Configuration
        # Default hotkey: Key.cmd_r (Right Command) on macOS, Key.ctrl_r on Windows/Linux
        self.hotkey_name = os.getenv('DICTATION_HOTKEY', 'cmd_r' if platform.system() == 'Darwin' else 'ctrl_r').lower()
        self.enabled = os.getenv('ENABLE_DICTATION', 'true').lower() == 'true'

    def get_frontmost_app_info(self):
        """Retrieves both process name and unique bundle ID of the frontmost application on macOS."""
        if platform.system() == 'Darwin':
            script = '''
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set appBundle to ""
                try
                    set appBundle to bundle identifier of frontApp
                end try
                return appName & "|||" & appBundle
            end tell
            '''
            try:
                res = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=1)
                if res.returncode == 0 and '|||' in res.stdout:
                    parts = res.stdout.strip().split('|||', 1)
                    appName = parts[0].strip()
                    appBundle = parts[1].strip() if len(parts) > 1 else ""
                    
                    if appName:
                        return appName, (appBundle if appBundle else None)
            except Exception as e:
                print(f"[Dictation] Failed to get frontmost app: {e}")
        return None, None

    def restore_and_paste(self, text):
        """Restores the original application window and pastes the transcribed text."""
        if not text:
            return

        # 1. Copy transcript to system clipboard
        pyperclip.copy(text)
        time.sleep(0.04)

        system = platform.system()
        if system == 'Darwin':
            # Use 'key code 9' (hardware keycode for V) instead of 'keystroke "v"'
            # to guarantee Cmd+V triggers in Telegram (Qt), Electron, and non-US layouts.
            if self.saved_bundle_id:
                script = f'''
                tell application id "{self.saved_bundle_id}" to activate
                delay 0.08
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            elif self.saved_app_name:
                script = f'''
                tell application "{self.saved_app_name}" to activate
                delay 0.08
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            else:
                script = '''
                delay 0.08
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            
            try:
                subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=2.0)
            except Exception as e:
                print(f"[Dictation] Failed to paste via AppleScript: {e}")
        else:
            try:
                from pynput.keyboard import Controller, Key
                kb = Controller()
                with kb.pressed(Key.ctrl):
                    kb.press('v')
                    kb.release('v')
            except Exception as e:
                print(f"[Dictation] Fallback paste failed: {e}")

    def matches_hotkey(self, key):
        """Checks if the pressed key matches the configured dictation hotkey."""
        try:
            if isinstance(key, keyboard.Key):
                return key.name.lower() == self.hotkey_name
            elif isinstance(key, keyboard.KeyCode):
                if key.char:
                    return key.char.lower() == self.hotkey_name
                if self.hotkey_name == 'f20' and key.vk in (90, 80):
                    return True
        except Exception:
            pass
        return False

    def on_press(self, key):
        if not self.enabled:
            return

        if self.matches_hotkey(key):
            with self.lock:
                if not self.is_recording:
                    self.is_recording = True
                    self.saved_app_name, self.saved_bundle_id = self.get_frontmost_app_info()
                    active_display = self.saved_app_name or self.saved_bundle_id or "Current"
                    print(f"[Dictation] Hotkey DOWN (Active app: {active_display}). Starting dictation...")
                    self.ws_broadcast({
                        'type': 'dictation_start',
                        'timestamp': time.time()
                    })

    def on_release(self, key):
        if not self.enabled:
            return

        if self.matches_hotkey(key):
            with self.lock:
                if self.is_recording:
                    self.is_recording = False
                    print("[Dictation] Hotkey UP. Stopping dictation...")
                    self.ws_broadcast({
                        'type': 'dictation_stop',
                        'timestamp': time.time()
                    })

    def handle_transcript_result(self, text):
        """Called when the Chrome extension sends back the final transcript."""
        target_display = self.saved_app_name or self.saved_bundle_id or "active app"
        print(f"[Dictation] Transcript received ({len(text)} chars): \"{text}\" -> Pasting into {target_display}")
        self.restore_and_paste(text)

    def start(self):
        """Starts the background keyboard listener thread."""
        if not self.enabled:
            print("[Dictation] Dictation daemon disabled via config.")
            return

        if DictationDaemon._started:
            return
        DictationDaemon._started = True

        def run_listener():
            print(f"[Dictation] Daemon active. Hold [{self.hotkey_name.upper()}] to dictate.")
            try:
                with keyboard.Listener(on_press=self.on_press, on_release=self.on_release) as listener:
                    self.listener = listener
                    listener.join()
            except Exception as e:
                print(f"[Dictation] Key listener encountered an error: {e}")

        t = threading.Thread(target=run_listener, daemon=True)
        t.start()