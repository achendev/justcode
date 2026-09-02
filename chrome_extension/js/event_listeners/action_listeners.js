import * as actionHandlers from '../ui_handlers/actions.js';
import { openContextManager } from '../ui_handlers/context_manager.js';

const DICTATION_SERVER_URL = 'http://127.0.0.1:5010';

function showDictationStatus(text, type) {
    const status = document.getElementById('dictationStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `alert alert-${type} py-2 px-3 mb-2`;
    status.classList.remove('d-none');
}

function setDictationButtonState(button, connected) {
    button.classList.toggle('btn-success', connected);
    button.classList.toggle('btn-outline-secondary', !connected);
    button.classList.remove('btn-danger');
    button.title = connected
        ? 'ChatGPT dictation bridge connected'
        : 'Set Current Tab as ChatGPT Dictation Worker';
}

async function getDictationBridgeStatus() {
    const response = await fetch(`${DICTATION_SERVER_URL}/dictation/status`, {
        method: 'GET',
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error(`Dictation server returned HTTP ${response.status}`);
    }
    return response.json();
}

async function authorizeLocalDictationBridge() {
    // Probe the same fixed endpoint used by the dictation WebSocket. The
    // literal address is already loopback, so no targetAddressSpace hint is
    // needed (and declaring it as "local" would be incorrect).
    await getDictationBridgeStatus();
}

async function waitForDictationBridge() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await getDictationBridgeStatus();
        if (status.bridge_connected) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Local dictation WebSocket did not connect');
}

async function waitForDictationBridgeDisconnect() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await getDictationBridgeStatus();
        if (!status.bridge_connected) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Local dictation WebSocket did not disconnect');
}

export function attachActionEventListeners() {
    // --- Main action buttons ---
    document.querySelectorAll('.get-context').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleGetContextClick(e));
    });
    document.querySelectorAll('.deploy-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleDeployCodeClick(e));
    });
    document.querySelectorAll('.undo-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleUndoCodeClick(e));
    });
    document.querySelectorAll('.redo-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleRedoCodeClick(e));
    });

    // --- Other action buttons ---
    document.querySelectorAll('.get-exclusion-prompt').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleGetExclusionSuggestionClick(e));
    });
    document.querySelectorAll('.update-app-button').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleUpdateAppClick(e));
    });
    document.querySelectorAll('.apply-replacements').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleApplyReplacementsClick(e));
    });

    document.querySelectorAll('.open-context-manager').forEach(button => {
        button.addEventListener('click', (e) => openContextManager(e));
    });

    // --- Top Menu Dictation Worker Button ---
    const dictationBtn = document.getElementById('dictationTabButton');
    if (dictationBtn) {
        const refreshButtonState = async () => {
            try {
                const status = await getDictationBridgeStatus();
                setDictationButtonState(dictationBtn, status.bridge_connected === true);
            } catch (error) {
                setDictationButtonState(dictationBtn, false);
            }
        };

        refreshButtonState();
        const bridgeStatusInterval = setInterval(refreshButtonState, 2000);
        window.addEventListener('unload', () => clearInterval(bridgeStatusInterval), { once: true });

        dictationBtn.addEventListener('click', async () => {
            try {
                const currentStatus = await getDictationBridgeStatus();
                if (currentStatus.bridge_connected) {
                    showDictationStatus('Disconnecting dictation bridge…', 'info');
                    const result = await chrome.runtime.sendMessage({
                        type: 'disconnect_dictation_bridge'
                    });
                    if (result?.status !== 'success') {
                        throw new Error(result?.error || 'Dictation bridge did not disconnect');
                    }
                    await waitForDictationBridgeDisconnect();
                    setDictationButtonState(dictationBtn, false);
                    showDictationStatus('Dictation bridge disconnected.', 'secondary');
                    setTimeout(() => {
                        document.getElementById('dictationStatus')?.classList.add('d-none');
                    }, 1200);
                    return;
                }

                showDictationStatus('Connecting dictation bridge…', 'info');
                await authorizeLocalDictationBridge();

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) {
                    throw new Error('Could not identify the active ChatGPT tab');
                }
                const hostname = tab.url ? new URL(tab.url).hostname : '';
                if (hostname !== 'chatgpt.com' && !hostname.endsWith('.chatgpt.com')) {
                    throw new Error('Open this popup from a chatgpt.com tab');
                }

                const result = await chrome.runtime.sendMessage({
                    type: 'set_dictation_tab',
                    tabId: tab.id,
                    reconnectBridge: true
                });
                if (result?.status !== 'success') {
                    throw new Error(result?.error || 'Dictation bridge did not reconnect');
                }
                await waitForDictationBridge();

                setDictationButtonState(dictationBtn, true);
                showDictationStatus('Dictation bridge connected.', 'success');
                setTimeout(() => {
                    document.getElementById('dictationStatus')?.classList.add('d-none');
                }, 1200);
            } catch (error) {
                console.error('JustCode: Failed to authorize dictation bridge:', error);
                setDictationButtonState(dictationBtn, false);
                dictationBtn.title = `Dictation bridge error: ${error.message}`;
                showDictationStatus(`Dictation error: ${error.message}`, 'danger');
            }
        });
    }
}
