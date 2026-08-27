import os
import sys
import time
import threading
import subprocess
import platform
import pyperclip
from pynput import keyboard

class DictationDaemon:
    def __init__(self, ws_broadcast_func):
        self.ws_broadcast = ws_broadcast_func
        self.is_recording = False
        self.saved_frontmost_app = None
        self.listener = None
        self.lock = threading.Lock()
        
        # Configuration
        # Default hotkey: Key.cmd_r (Right Command) on macOS, Key.ctrl_r on Windows/Linux
        # Configurable via environment variable DICTATION_HOTKEY (e.g., cmd_r, ctrl_r, alt_r, f20)
        self.hotkey_name = os.getenv('DICTATION_HOTKEY', 'cmd_r' if platform.system() == 'Darwin' else 'ctrl_r').lower()
        self.enabled = os.getenv('ENABLE_DICTATION', 'true').lower() == 'true'

    def get_frontmost_app(self):
        """Retrieves the name/ID of the frontmost application before dictation begins."""
        system = platform.system()
        if system == 'Darwin':
            script = 'tell application "System Events" to get name of first process whose frontmost is true'
            try:
                res = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=1)
                if res.returncode == 0:
                    return res.stdout.strip()
            except Exception as e:
                print(f"[Dictation] Failed to get frontmost app on macOS: {e}")
        return None

    def restore_and_paste(self, text):
        """Restores the original application window and pastes the transcribed text."""
        if not text:
            return

        # 1. Set text to clipboard
        pyperclip.copy(text)
        time.sleep(0.05)

        system = platform.system()
        if system == 'Darwin':
            # Reactivate original app & send Command+V
            if self.saved_frontmost_app:
                script = f'''
                tell application "{self.saved_frontmost_app}" to activate
                delay 0.08
                tell application "System Events" to keystroke "v" using command down
                '''
            else:
                script = 'tell application "System Events" to keystroke "v" using command down'
            
            try:
                subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=2)
            except Exception as e:
                print(f"[Dictation] Failed to paste via AppleScript: {e}")
        else:
            # Fallback for Linux / Windows using pynput controller
            try:
                from pynput.keyboard import Controller, Key
                kb = Controller()
                modifier = Key.ctrl
                with kb.pressed(modifier):
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
                # Check for special virtual key codes like F20
                if self.hotkey_name == 'f20' and key.vk in (90, 80): # macOS F20 / alias
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
                    self.saved_frontmost_app = self.get_frontmost_app()
                    print(f"[Dictation] Hotkey DOWN (App: {self.saved_frontmost_app}). Starting dictation...")
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
        print(f"[Dictation] Transcript received ({len(text)} chars): {text}")
        self.restore_and_paste(text)

    def start(self):
        """Starts the background keyboard listener thread."""
        if not self.enabled:
            print("[Dictation] Dictation daemon disabled via config.")
            return

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