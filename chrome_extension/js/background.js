import { saveData, loadData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';
import { applyReplacementsAndPaste } from './apply_replacements.js';
import { injectShortcutListener } from './background/shortcuts.js';
import { extractCodeWithFallback } from './deploy_code/robust_fallback.js';
import { handleMcpRequest } from './mcp_handler.js';
import { handleDictationStart, handleDictationStop, setDedicatedDictationTab } from './dictation_handler.js';

// --- Default settings ---
const AppSettings = {
    shortcutDomains: 'aistudio.google.com,grok.com,x.com,www.perplexity.ai,gemini.google.com,chatgpt.com,claude.ai',
    notificationPosition: 'bottom-left',
    notificationTimeout: 4,
    showNotificationProgressBar: true,
    isGetContextShortcutEnabled: true,
    isDeployCodeShortcutEnabled: true,
    isUndoShortcutEnabled: true,
    isRedoShortcutEnabled: true,
    isApplyReplacementsShortcutEnabled: true,
    rememberTabProfile: true,
    splitContextBySize: false,
    contextSplitSize: 450
};

async function loadAndEnsureSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(Object.keys(AppSettings), (storedSettings) => {
            const finalSettings = { ...AppSettings, ...storedSettings };
            resolve(finalSettings);
        });
    });
}

// Helper: Sleep for X milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function updateProfileStatus(profileId, text, type) {
    return new Promise(resolve => {
        loadData((profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                profile.lastMessage = { text, type };
                saveData(profiles, activeProfileId, archivedProfiles, resolve);
            } else {
                resolve();
            }
        });
    });
}

async function ensureContentScript(tabId) {
    try {
        // Remove the retired dictation notification even when the rest of the
        // content-script bundle is already present in this tab.
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => document
                .getElementById('justcode-notification-justcode-dictation-notify')
                ?.remove()
        });
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => window.justCodeContentLoaded,
        });
        if (results && results[0] && results[0].result) return;

        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [
                "js/content_script/notification_dom.js",
                "js/content_script/notification_manager.js",
                "js/content_script/notification_timer.js",
                "js/content_script.js"
            ],
        });
    } catch (err) {}
}

async function initializeAllTabs() {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (tab.id) {
            await ensureContentScript(tab.id);
            injectShortcutListener(tab.id);
        }
    }
}

// --- WebSocket bridge logic ---
// Dictation is a global extension feature. It must never inherit a profile's
// server URL; MCP is the only channel whose destination follows a profile.
const DICTATION_SERVER_URL = 'http://127.0.0.1:5010';
const BRIDGE_RECONNECT_ALARM = 'justcode-bridge-reconnect';
let dictationBridgeEnabled = false;

function createWebSocketChannel(name, capability, handleMessage, handleDisconnect = null) {
    let socket = null;
    let keepAliveInterval = null;
    let reconnectTimeout = null;
    let reconnectEnabled = false;
    let lastServerUrl = null;
    let lastContext = {};

    function clearChannelTimers() {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    }

    function scheduleReconnect() {
        if (!reconnectEnabled || reconnectTimeout || !lastServerUrl) return;
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect(lastServerUrl, lastContext);
        }, 3000);
    }

    function connect(serverUrl, context = {}, force = false) {
        if (!serverUrl) return;

        const normalizedServerUrl = serverUrl.replace(/\/+$/, '');
        const wsUrl = normalizedServerUrl.replace(/^http/, 'ws') + '/ws';
        lastServerUrl = normalizedServerUrl;
        lastContext = context;
        reconnectEnabled = true;

        if (!force && socket &&
            (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) &&
            socket.url === wsUrl) {
            return;
        }

        clearChannelTimers();
        if (socket) {
            const previousSocket = socket;
            socket = null;
            previousSocket.onclose = null;
            previousSocket.close();
        }

        console.log(`${name}: Connecting to ${wsUrl}...`);
        try {
            const currentSocket = new WebSocket(wsUrl);
            socket = currentSocket;

            currentSocket.onopen = () => {
                if (socket !== currentSocket) return;
                console.log(`${name}: WebSocket connected.`);
                currentSocket.send(JSON.stringify({
                    type: 'register',
                    capabilities: [capability]
                }));
                keepAliveInterval = setInterval(() => {
                    if (socket === currentSocket && currentSocket.readyState === WebSocket.OPEN) {
                        currentSocket.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 15000);
            };

            currentSocket.onmessage = async event => {
                if (socket !== currentSocket) return;
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'pong' || message.type === 'registered') return;
                    await handleMessage(message, currentSocket, context);
                } catch (error) {
                    console.error(`${name}: Error processing message`, error);
                }
            };

            currentSocket.onclose = () => {
                if (socket !== currentSocket) return;
                console.log(`${name}: WebSocket closed.`);
                clearChannelTimers();
                socket = null;
                if (handleDisconnect) {
                    Promise.resolve(handleDisconnect()).catch(error => {
                        console.error(`${name}: Disconnect cleanup failed`, error);
                    });
                }
                scheduleReconnect();
            };

            currentSocket.onerror = error => {
                if (socket === currentSocket) {
                    console.error(`${name}: WebSocket error`, error);
                }
            };
        } catch (error) {
            socket = null;
            console.error(`${name}: Connection failed`, error);
            scheduleReconnect();
        }
    }

    function disconnect() {
        reconnectEnabled = false;
        clearChannelTimers();
        const wasConnected = Boolean(socket);
        if (socket) {
            const currentSocket = socket;
            socket = null;
            currentSocket.onclose = null;
            currentSocket.close();
        }
        if (wasConnected && handleDisconnect) {
            Promise.resolve(handleDisconnect()).catch(error => {
                console.error(`${name}: Disconnect cleanup failed`, error);
            });
        }
    }

    return {
        connect,
        disconnect,
        send: payload => {
            if (socket?.readyState !== WebSocket.OPEN) return false;
            socket.send(JSON.stringify(payload));
            return true;
        },
        isConnected: () => socket?.readyState === WebSocket.OPEN
    };
}

async function handleMcpSocketMessage(message, socket, context) {
    if (message.type !== 'mcp_request') return;

    console.log('MCP: Received request', message.id);
    loadData(async (profiles, activeProfileId) => {
        const targetId = context.profileId || activeProfileId;
        const profile = profiles.find(item => item.id === targetId);
        if (!profile) return;

        try {
            const answer = await handleMcpRequest(profile, message.id, message.prompt);
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'mcp_response',
                    id: message.id,
                    text: answer
                }));
            }
            console.log('MCP: Sent response.');
        } catch (error) {
            console.error('MCP Execution Error:', error);
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'mcp_response',
                    id: message.id,
                    text: `Error: ${error.message}`
                }));
            }
        }
    });
}

const DICTATION_HOLD_THRESHOLD_MS = 300;
let requestedDictationSessionId = null;
let nextDictationSessionId = 0;
let currentDictationSession = null;
const dictationSessions = new Map();

function retireDictationSession(session) {
    // Keep the mapping briefly so late page-driver debug messages still map
    // from the extension's session ID to the server's session ID.
    setTimeout(() => {
        if (dictationSessions.get(session.id) === session) {
            dictationSessions.delete(session.id);
        }
    }, 60000);
}

function sendDictationDebug(socket, event, session = null, details = {}) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    try {
        socket.send(JSON.stringify({
            type: 'dictation_debug',
            event,
            sessionId: session?.bridgeSessionId ?? null,
            details
        }));
    } catch (error) {
        console.debug('Dictation: Could not send debug trace', error);
    }
}

function handleDictationSocketMessage(message, socket) {
    if (message.type === 'dictation_start') {
        const sessionId = ++nextDictationSessionId;
        const session = {
            id: sessionId,
            bridgeSessionId: message.sessionId ?? sessionId,
            startCompleted: false,
            recordingActivated: false,
            focusContext: {},
            startedAt: Number.isFinite(message.timestamp)
                ? message.timestamp * 1000
                : Date.now()
        };
        requestedDictationSessionId = sessionId;
        currentDictationSession = session;
        dictationSessions.set(sessionId, session);
        const options = {
            switchOnStart: message.switchOnStart === true || message.mode === 'foreground',
            sessionId,
            startedAt: session.startedAt,
            activationDelayMs: DICTATION_HOLD_THRESHOLD_MS,
            isSessionActive: () => requestedDictationSessionId === sessionId,
            focusContext: session.focusContext,
            debug: (event, details = {}) => sendDictationDebug(socket, event, session, details)
        };

        sendDictationDebug(socket, 'start_received', session, {
            mode: message.mode,
            switchOnStart: options.switchOnStart
        });

        // Every session owns its own start promise. A transcript wait from an
        // older session must never block a new hotkey press for 3–15 seconds.
        session.startPromise = (async () => {
            if (requestedDictationSessionId !== sessionId) return;
            session.recordingActivated = await handleDictationStart(options);
            session.startCompleted = true;
            sendDictationDebug(socket, 'start_completed', session, {
                recordingActivated: session.recordingActivated
            });
        })().catch(error => {
            session.startCompleted = true;
            session.recordingActivated = false;
            sendDictationDebug(socket, 'start_failed', session, { error: String(error) });
            console.error('Dictation: Start operation failed', error);
        });
        return session.startPromise;
    } else if (message.type === 'dictation_stop') {
        const session = currentDictationSession;
        if (!session) {
            sendDictationDebug(socket, 'stop_ignored_no_session', null, {
                bridgeSessionId: message.sessionId ?? null
            });
            return Promise.resolve();
        }
        if (message.sessionId != null &&
            session.bridgeSessionId != null &&
            message.sessionId !== session.bridgeSessionId) {
            sendDictationDebug(socket, 'stop_ignored_stale_session', session, {
                receivedBridgeSessionId: message.sessionId
            });
            console.warn('Dictation: Ignoring stop for a stale session', message.sessionId);
            return Promise.resolve();
        }

        requestedDictationSessionId = null;
        currentDictationSession = null;
        const startedAt = session?.startedAt || 0;
        const stoppedAt = Number.isFinite(message.timestamp)
            ? message.timestamp * 1000
            : Date.now();
        const durationMs = startedAt > 0 ? Math.max(0, stoppedAt - startedAt) : 0;
        const cancel = startedAt === 0 ||
            durationMs <= DICTATION_HOLD_THRESHOLD_MS;

        sendDictationDebug(socket, 'stop_received', session, { durationMs, cancel });
        session.stopPromise = (async () => {
            // Stop may arrive while Chrome is still locating/injecting the
            // dictation tab. Wait only for this session's start, never for a
            // previous session's transcript extraction.
            await session.startPromise;
            if (session.recordingActivated !== true) {
                sendDictationDebug(socket, 'stop_skipped_not_activated', session);
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'dictation_result',
                        text: '',
                        cancelled: true,
                        sessionId: session.bridgeSessionId
                    }));
                }
                return;
            }
            await handleDictationStop(
                (transcript, result = {}) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'dictation_result',
                            text: cancel ? '' : transcript,
                            cancelled: cancel,
                            superseded: result.superseded === true,
                            sessionId: session.bridgeSessionId
                        }));
                    }
                }, {
                    cancel,
                    durationMs,
                    focusOnStop: true,
                    sessionId: session.id,
                    focusContext: session.focusContext,
                    debug: (event, details = {}) => sendDictationDebug(socket, event, session, details)
                }
            );
        })().catch(error => {
            sendDictationDebug(socket, 'stop_failed', session, { error: String(error) });
            console.error('Dictation: Stop operation failed', error);
        }).finally(() => {
            retireDictationSession(session);
        });
        return session.stopPromise;
    }

    return Promise.resolve();
}

function handleDictationBridgeDisconnect() {
    const session = currentDictationSession;
    requestedDictationSessionId = null;
    currentDictationSession = null;
    if (!session) return Promise.resolve();

    return (async () => {
        await session.startPromise;
        if (session.recordingActivated !== true) return;
        await handleDictationStop(
            () => {},
            {
                cancel: true,
                durationMs: Math.max(0, Date.now() - session.startedAt),
                focusOnStop: true,
                sessionId: session.id,
                focusContext: session.focusContext
            }
        );
    })().finally(() => {
        retireDictationSession(session);
    });
}

const mcpChannel = createWebSocketChannel('MCP', 'mcp', handleMcpSocketMessage);
const dictationChannel = createWebSocketChannel(
    'Dictation',
    'dictation',
    handleDictationSocketMessage,
    handleDictationBridgeDisconnect
);

// The page driver reports its internal transitions through the extension so
// the same session timeline is available in the server-side debug log.
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'dictation_debug_trace') return;
    const session = dictationSessions.get(message.sessionId);
    dictationChannel.send({
        type: 'dictation_debug',
        event: message.event,
        sessionId: session?.bridgeSessionId ?? null,
        details: {
            ...(message.details || {}),
            extensionSessionId: message.sessionId ?? null,
            tabId: sender.tab?.id ?? null
        }
    });
});

function reconnectMcpSocketFromActiveProfile(force = false) {
    loadData((profiles, activeProfileId) => {
        const activeProfile = profiles.find(profile => profile.id === activeProfileId);
        if (activeProfile?.mode === 'mcp') {
            mcpChannel.connect(activeProfile.serverUrl, { profileId: activeProfile.id }, force);
        } else {
            mcpChannel.disconnect();
        }
    });
}

function reconnectDictationSocket(force = false) {
    if (!dictationBridgeEnabled) return;
    dictationChannel.connect(DICTATION_SERVER_URL, {}, force);
}

// JavaScript timers disappear when Chrome suspends a Manifest V3 service
// worker. This alarm restores either channel after suspension or server restart.
chrome.alarms.create(BRIDGE_RECONNECT_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== BRIDGE_RECONNECT_ALARM) return;
    if (dictationBridgeEnabled && !dictationChannel.isConnected()) reconnectDictationSocket();
    if (!mcpChannel.isConnected()) reconnectMcpSocketFromActiveProfile();
});

// Restore the user's global dictation toggle independently of profile data.
chrome.storage.local.get({ dictationBridgeEnabled: true }).then(settings => {
    dictationBridgeEnabled = settings.dictationBridgeEnabled;
    reconnectDictationSocket();
});
reconnectMcpSocketFromActiveProfile();

// --- Auto Deploy Logic ---

async function performAutoDeploy(profileId, tabId, hostname, codeToDeploy = null) {
    const notificationId = 'justcode-autodeploy-active-sequence';
    
    // Load fresh data to get current handles/paths
    return new Promise(resolve => {
        loadData(async (profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === profileId);
            if (!profile) return resolve();

            const notify = (text, type = 'info', spinner = false, actionsHTML = null) => {
                if (tabId) {
                    chrome.tabs.sendMessage(tabId, { 
                        type: 'showNotificationOnPage', 
                        notificationId, 
                        text, 
                        messageType: type, 
                        showSpinner: spinner,
                        actionsHTML: actionsHTML
                    }).catch(() => {});
                }
            };

            notify("Auto-deploying...", "info", true);

            try {
                // Pass codeToDeploy and tabId to deployCode
                const result = await deployCode(profile, true, hostname, codeToDeploy, tabId);
                await updateProfileStatus(profile.id, result.text + " (Auto)", result.type);
                
                // Construct Actions HTML for success message (Policy Switcher)
                const isReview = profile.agentReviewPolicy !== 'always';
                const policySelector = `
                    <select class="jc-policy-select" title="Change Auto-Deploy Policy">
                        <option value="review" ${isReview ? 'selected' : ''}>Request review</option>
                        <option value="always" ${!isReview ? 'selected' : ''}>Always allow</option>
                    </select>
                `;
                
                notify(result.text + " (Auto)", result.type, false, policySelector);
            
            } catch (e) {
                const isScriptNotFoundError = e.message && (
                    e.message.includes("No valid deploy script") || 
                    e.message.includes("Could not find target")
                );

                if (isScriptNotFoundError) {
                    const msg = "Auto-deploy failed: No script found.";
                    await updateProfileStatus(profile.id, msg, "error");
                    notify(msg, "error", false);
                } else {
                    console.error("JustCode: Auto-deploy fatal error:", e);
                    const msg = "Auto-deploy failed: " + e.message;
                    await updateProfileStatus(profile.id, msg, "error");
                    notify(msg, "error", false);
                }
            }
            resolve();
        });
    });
}

// Stores the pending auto-deploy state
let pendingAutoDeploy = null;

async function handleAutoDeployTrigger(sender) {
    console.log("JustCode: Auto-deploy triggered.");
    
    const tab = sender.tab;
    if (!tab || !tab.id) return;

    const notificationId = 'justcode-autodeploy-active-sequence';
    const notify = (text, type, spinner, actionsHTML) => {
        chrome.tabs.sendMessage(tab.id, { 
            type: 'showNotificationOnPage', notificationId, text, messageType: type, showSpinner: spinner, actionsHTML 
        }).catch(() => {});
    };

    const settings = await chrome.storage.local.get({ rememberTabProfile: true });
    const data = await chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles', 'tabProfileMap']);

    // Determine the profile for this specific tab
    let profileId = data.activeProfileId;
    if (settings.rememberTabProfile && data.tabProfileMap && data.tabProfileMap[tab.id]) {
        const mappedId = data.tabProfileMap[tab.id];
        if (data.profiles.some(p => p.id === mappedId)) profileId = mappedId;
    }

    const activeProfile = data.profiles.find(p => p.id === profileId);
    
    // Check if autoDeploy is enabled for this specific profile
    if (!activeProfile || !activeProfile.autoDeploy) return;

    // Delay for rendering
    notify("Auto-deploy: Waiting for rendering...", "info", true);
    await sleep(1000);

    const hostname = tab.url ? new URL(tab.url).hostname : null;

    // --- Pre-extract code to check for <done /> tag ---
    let codeToDeploy = null;
    try {
        const extraction = await extractCodeWithFallback(activeProfile, true, hostname, tab.id);
        codeToDeploy = extraction.codeToDeploy;
    } catch (e) {
        console.warn("JustCode: Auto-deploy extraction failed.", e);
    }

    // Regex to check for done tag (Robust)
    const DONE_TAG_REGEX = /<done\b[^>]*\/?>/i;
    
    if (codeToDeploy && DONE_TAG_REGEX.test(codeToDeploy)) {
        console.log("JustCode: Agent signaled done via <done /> tag. Finishing without deployment.");
        const msg = "Task Completed.";
        await updateProfileStatus(profileId, msg, "success");
        notify(msg, "success", false);
        return;
    }
    // ------------------------------------

    if (activeProfile.agentReviewPolicy === 'always') {
        // DIRECT EXECUTION
        await performAutoDeploy(profileId, tab.id, hostname, codeToDeploy);
    } else {
        // REQUEST REVIEW
        const actionsHTML = `
            <button class="jc-btn jc-btn-allow">Allow</button>
            <button class="jc-btn jc-btn-decline">Decline</button>
        `;
        
        // Store state for when user clicks Allow, including the cached code
        pendingAutoDeploy = {
            profileId: profileId,
            tabId: tab.id,
            hostname: hostname,
            codeToDeploy: codeToDeploy
        };

        notify("Agent requests to deploy changes.", "info", false, actionsHTML);
    }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Content Script Ready
    if (message.type === 'justcode-content-script-ready') {
        loadAndEnsureSettings().then(settings => {
            sendResponse({status: 'success', settings: settings});
            if (sender.tab?.id) injectShortcutListener(sender.tab.id);
        });
        return true; 
    }

    // 2. Set Dedicated Dictation Tab
    if (message.type === 'set_dictation_tab') {
        setDedicatedDictationTab(message.tabId);
        dictationBridgeEnabled = true;
        chrome.storage.local.set({ dictationBridgeEnabled: true });
        if (message.reconnectBridge) {
            reconnectDictationSocket(true);
        }
        sendResponse({ status: 'success' });
        return true;
    }

    if (message.type === 'disconnect_dictation_bridge') {
        dictationBridgeEnabled = false;
        dictationChannel.disconnect();
        chrome.storage.local.set({ dictationBridgeEnabled: false }).then(() => {
            sendResponse({ status: 'success' });
        });
        return true;
    }

    // 3. Auto Deploy Trigger (From Content Script Observer)
    if (message.type === 'auto_deploy_trigger') {
        handleAutoDeployTrigger(sender);
        return true;
    }

    // 4. Auto Deploy Response (User clicked Allow/Decline)
    if (message.type === 'auto_deploy_response') {
        if (message.approved && pendingAutoDeploy) {
            // Proceed
            performAutoDeploy(pendingAutoDeploy.profileId, pendingAutoDeploy.tabId, pendingAutoDeploy.hostname, pendingAutoDeploy.codeToDeploy)
                .then(() => { pendingAutoDeploy = null; });
        } else {
            // Declined
            pendingAutoDeploy = null;
        }
        return true;
    }

    // 5. Update Policy (User changed selector in notification)
    if (message.type === 'update_agent_policy') {
        loadData((profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === activeProfileId); // Assume active for now
            if (profile) {
                profile.agentReviewPolicy = message.policy;
                saveData(profiles, activeProfileId, archivedProfiles);
                console.log(`JustCode: Policy updated to ${message.policy}`);
            }
        });
        return true;
    }

    // 6. MCP Mode Toggle Signal
    if (message.type === 'mcp_mode_changed') {
        if (message.enabled) {
            mcpChannel.connect(message.serverUrl, { profileId: message.profileId }, true);
        } else {
            mcpChannel.disconnect();
        }
        return true;
    }

    // 7. Shortcuts
    if (message.type === 'try-execute-command' || message.type === 'execute-command') {
        const execute = async () => {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab || !tab.id) return;
            
            await ensureContentScript(tab.id);
            
            let command = message.command;
            let actionFunc, progressText;
            switch(command) {
                case "get-context-shortcut": actionFunc = getContext; progressText = 'Getting context...'; break;
                case "deploy-code-shortcut": actionFunc = deployCode; progressText = 'Deploying code...'; break;
                case "undo-code-shortcut": actionFunc = undoCode; progressText = 'Undoing last action...'; break;
                case "redo-code-shortcut": actionFunc = redoCode; progressText = 'Redoing last undo...'; break;
                case "apply-replacements-shortcut": 
                    actionFunc = (p, fromSc, hn) => applyReplacementsAndPaste(p, fromSc, false, hn); 
                    progressText = 'Applying replacements...'; 
                    break;
                case "reverse-replacements-shortcut": 
                    actionFunc = (p, fromSc, hn) => applyReplacementsAndPaste(p, fromSc, true, hn); 
                    progressText = 'Reversing replacements...'; 
                    break;
                default: return;
            }

            // Verify settings if 'try-execute'
            if (message.type === 'try-execute-command') {
                const settings = await loadAndEnsureSettings();
                const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
                if (!allowedDomains.includes(message.hostname)) return;
                
                let isEnabled = false;
                if (command === 'get-context-shortcut') isEnabled = settings.isGetContextShortcutEnabled;
                else if (command === 'deploy-code-shortcut') isEnabled = settings.isDeployCodeShortcutEnabled;
                else if (command === 'undo-code-shortcut') isEnabled = settings.isUndoShortcutEnabled;
                else if (command === 'redo-code-shortcut') isEnabled = settings.isRedoShortcutEnabled;
                else if (command === 'apply-replacements-shortcut' || command === 'reverse-replacements-shortcut') isEnabled = settings.isApplyReplacementsShortcutEnabled;
                if (!isEnabled) return;
            }

            // Execute
            const notificationId = `justcode-action-${Date.now()}`;
            chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: progressText, messageType: 'info', showSpinner: true }).catch(()=>{});

            try {
                // Profile resolution logic...
                const settings = await chrome.storage.local.get({ rememberTabProfile: true });
                const data = await chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles', 'tabProfileMap']);
                
                let profileId = data.activeProfileId;
                if (settings.rememberTabProfile && data.tabProfileMap && data.tabProfileMap[tab.id]) {
                    const mappedId = data.tabProfileMap[tab.id];
                    if (data.profiles.some(p => p.id === mappedId)) profileId = mappedId;
                }
                
                if (command === 'get-context-shortcut' && settings.rememberTabProfile) {
                    const tabProfileMap = data.tabProfileMap || {};
                    tabProfileMap[tab.id] = profileId;
                    await chrome.storage.local.set({ tabProfileMap });
                }

                const profile = data.profiles.find(p => p.id === profileId);
                if (profile) {
                    const result = await actionFunc(profile, true, message.hostname);
                    
                    // Show result on page
                    chrome.tabs.sendMessage(tab.id, { 
                        type: 'showNotificationOnPage', notificationId, text: result.text, messageType: result.type, showSpinner: false 
                    }).catch(()=>{});

                    // Save result to profile storage (for Popup sync)
                    await updateProfileStatus(profile.id, result.text, result.type);
                }
            } catch (e) {
                const msg = "Error: " + e.message;
                chrome.tabs.sendMessage(tab.id, { 
                    type: 'showNotificationOnPage', notificationId, text: msg, messageType: 'error', showSpinner: false 
                }).catch(()=>{});
                
                console.error("JustCode Shortcut Error:", e);
            }
        };
        execute();
        return true;
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    initializeAllTabs();
});
chrome.runtime.onStartup.addListener(initializeAllTabs);
initializeAllTabs();

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const settings = await chrome.storage.local.get({ rememberTabProfile: true });
    if (settings.rememberTabProfile) {
        const data = await chrome.storage.local.get({ tabProfileMap: {} });
        const tabProfileMap = data.tabProfileMap;
        if (tabProfileMap[tabId]) {
            delete tabProfileMap[tabId];
            await chrome.storage.local.set({ tabProfileMap });
        }
    }
});
