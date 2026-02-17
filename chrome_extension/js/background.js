import { saveData, loadData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';
import { applyReplacementsAndPaste } from './apply_replacements.js';
import { injectShortcutListener } from './background/shortcuts.js';
import { extractCodeWithFallback } from './deploy_code/robust_fallback.js';
import { handleMcpRequest } from './mcp_handler.js';

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

// --- WebSocket / MCP Logic ---
let mcpSocket = null;

function connectMcpSocket(serverUrl, profileId) {
    if (mcpSocket) {
        mcpSocket.close();
        mcpSocket = null;
    }

    const wsUrl = serverUrl.replace('http', 'ws') + '/ws';
    console.log(`MCP: Connecting to ${wsUrl}...`);

    try {
        mcpSocket = new WebSocket(wsUrl);

        mcpSocket.onopen = () => {
            console.log("MCP: WebSocket Connected.");
            updateProfileStatus(profileId, "MCP Connected", "success");
        };

        mcpSocket.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'mcp_request') {
                    console.log("MCP: Received request", msg.id);
                    
                    // Fetch profile again to be safe
                    loadData(async (profiles) => {
                        const profile = profiles.find(p => p.id === profileId);
                        if (!profile) return;

                        try {
                            const answer = await handleMcpRequest(profile, msg.id, msg.prompt);
                            
                            // Send response back
                            mcpSocket.send(JSON.stringify({
                                type: 'mcp_response',
                                id: msg.id,
                                text: answer
                            }));
                            console.log("MCP: Sent response.");
                        } catch (err) {
                            console.error("MCP Execution Error:", err);
                            mcpSocket.send(JSON.stringify({
                                type: 'mcp_response',
                                id: msg.id,
                                text: `Error: ${err.message}`
                            }));
                        }
                    });
                }
            } catch (e) {
                console.error("MCP: Error processing message", e);
            }
        };

        mcpSocket.onclose = () => {
            console.log("MCP: WebSocket Closed.");
            mcpSocket = null;
        };

        mcpSocket.onerror = (e) => {
            console.error("MCP: WebSocket Error", e);
        };

    } catch (e) {
        console.error("MCP: Connection failed", e);
    }
}

function disconnectMcpSocket() {
    if (mcpSocket) {
        mcpSocket.close();
        mcpSocket = null;
    }
}

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
    // -------------------------------------------------

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

    // 2. Auto Deploy Trigger (From Content Script Observer)
    if (message.type === 'auto_deploy_trigger') {
        handleAutoDeployTrigger(sender);
        return true;
    }

    // 3. Auto Deploy Response (User clicked Allow/Decline)
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

    // 4. Update Policy (User changed selector in notification)
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

    // 5. MCP Mode Toggle Signal
    if (message.type === 'mcp_mode_changed') {
        if (message.enabled) {
            connectMcpSocket(message.serverUrl, message.profileId);
        } else {
            disconnectMcpSocket();
        }
        return true;
    }

    // 6. Shortcuts
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
                case "apply-replacements-shortcut": actionFunc = applyReplacementsAndPaste; progressText = 'Applying replacements...'; break;
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
                else if (command === 'apply-replacements-shortcut') isEnabled = settings.isApplyReplacementsShortcutEnabled;
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