document.addEventListener('DOMContentLoaded', () => {
    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const errorDiv = document.getElementById('error');

    // Load profiles from storage
    function loadProfiles(callback) {
        chrome.storage.local.get(['profiles', 'activeProfileId'], (data) => {
            const profiles = data.profiles || [{ id: Date.now(), name: 'Default', projectPath: '', copyToClipboard: true }];
            const activeProfileId = data.activeProfileId || profiles[0].id;
            if (!data.profiles) {
                chrome.storage.local.set({ profiles, activeProfileId }, () => callback(profiles, activeProfileId));
            } else {
                callback(profiles, activeProfileId);
            }
        });
    }

    // Save profiles to storage
    function saveProfiles(profiles, activeProfileId) {
        chrome.storage.local.set({ profiles, activeProfileId }, () => {
            console.log('JustCode: Profiles saved:', profiles, 'Active Profile ID:', activeProfileId);
        });
    }

    // Render profiles and tabs
    function renderProfiles(profiles, activeProfileId) {
        // Render tabs
        profileTabs.innerHTML = '';
        profiles.forEach(profile => {
            const tab = document.createElement('li');
            tab.className = 'nav-item';
            tab.innerHTML = `
                <a class="nav-link ${profile.id === activeProfileId ? 'active' : ''}" href="#" data-id="${profile.id}">${profile.name}</a>
            `;
            profileTabs.appendChild(tab);
        });

        // Render profile content
        profilesContainer.innerHTML = '';
        profiles.forEach(profile => {
            const profileCard = document.createElement('div');
            profileCard.className = `profile-card tab-content ${profile.id === activeProfileId ? 'active' : ''}`;
            profileCard.id = `profile-${profile.id}`;
            profileCard.innerHTML = `
                <div class="profile-header">
                    <input type="text" class="profile-name-input" value="${profile.name}" data-id="${profile.id}">
                    <button class="btn btn-outline-danger btn-sm delete-profile" data-id="${profile.id}">Delete</button>
                </div>
                <div class="mb-3">
                    <label for="projectPath-${profile.id}" class="form-label">Project Path:</label>
                    <input type="text" class="form-control form-control-sm project-path" id="projectPath-${profile.id}" placeholder="/path/to/project" value="${profile.projectPath}">
                </div>
                <div class="form-check mb-3">
                    <input type="checkbox" class="form-check-input copy-to-clipboard" id="copyToClipboard-${profile.id}" ${profile.copyToClipboard ? 'checked' : ''}>
                    <label class="form-check-label" for="copyToClipboard-${profile.id}">Copy to clipboard on Get Code</label>
                </div>
                <div class="d-flex gap-2 mb-3">
                    <button class="btn btn-primary btn-sm flex-grow-1 get-code" data-id="${profile.id}">Get Code</button>
                    <button class="btn btn-success btn-sm flex-grow-1 deploy-code" data-id="${profile.id}">Deploy Code</button>
                </div>
            `;
            profilesContainer.appendChild(profileCard);
        });

        // Add event listeners
        document.querySelectorAll('.nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const id = parseInt(e.target.dataset.id);
                loadProfiles((profiles) => {
                    saveProfiles(profiles, id);
                    renderProfiles(profiles, id);
                });
            });
        });

        document.querySelectorAll('.profile-name-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id);
                loadProfiles((profiles, activeProfileId) => {
                    const profile = profiles.find(p => p.id === id);
                    profile.name = e.target.value.trim() || 'Unnamed';
                    saveProfiles(profiles, activeProfileId);
                    renderProfiles(profiles, activeProfileId);
                });
            });
        });

        document.querySelectorAll('.project-path').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(e.target.id.split('-')[1]);
                loadProfiles((profiles, activeProfileId) => {
                    const profile = profiles.find(p => p.id === id);
                    profile.projectPath = e.target.value.trim();
                    saveProfiles(profiles, activeProfileId);
                });
            });
        });

        document.querySelectorAll('.copy-to-clipboard').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = parseInt(e.target.id.split('-')[1]);
                loadProfiles((profiles, activeProfileId) => {
                    const profile = profiles.find(p => p.id === id);
                    profile.copyToClipboard = e.target.checked;
                    saveProfiles(profiles, activeProfileId);
                });
            });
        });

        document.querySelectorAll('.get-code').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                loadProfiles(async (profiles, activeProfileId) => {
                    const profile = profiles.find(p => p.id === id);
                    const path = profile.projectPath;
                    if (!path) {
                        errorDiv.textContent = 'Error: Please enter a project path.';
                        return;
                    }
                    const endpoint = `http://127.0.0.1:5010/getcode?path=${encodeURIComponent(path)}`;
                    console.log('JustCode: Fetching project state...');
                    try {
                        const response = await fetch(endpoint);
                        const responseText = await response.text();
                        if (!response.ok) {
                            throw new Error(`Server error: ${response.status} ${responseText}`);
                        }
                        if (profile.copyToClipboard) {
                            await navigator.clipboard.writeText(responseText);
                            console.log('JustCode: Project state copied to clipboard.');
                        }
                        chrome.scripting.executeScript({
                            target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
                            func: (text) => {
                                const selectors = [
                                    'textarea[aria-label="Start typing a prompt"]',
                                    'textarea[aria-label="Ask Grok anything"]',
                                    'textarea[aria-label="Type something or tab to choose an example prompt"]',
                                    'p[placeholder="data-placeholder"]',
                                    'textarea[placeholder="Ask anything"]'
                                ];
                                let textarea;
                                for (const selector of selectors) {
                                    textarea = document.querySelector(selector);
                                    if (textarea) break;
                                }
                                if (!textarea) {
                                    console.error('JustCode Error: Could not find target textarea.');
                                    return;
                                }
                                textarea.value = text;
                                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                                textarea.focus();
                                textarea.scrollTop = textarea.scrollHeight;
                                console.log('JustCode: Project state loaded into textarea.');
                            },
                            args: [responseText]
                        });
                        errorDiv.textContent = profile.copyToClipboard ? 'Code loaded and copied to clipboard!' : 'Code loaded successfully!';
                    } catch (error) {
                        errorDiv.textContent = `Error: ${error.message}`;
                        console.error('JustCode Error:', error);
                    }
                });
            });
        });

        document.querySelectorAll('.deploy-code').forEach(button => {
            button.addEventListener('click', async (e) => {
                errorDiv.textContent = '';
                const id = parseInt(e.target.dataset.id);
                loadProfiles(async (profiles, activeProfileId) => {
                    const profile = profiles.find(p => p.id === id);
                    const path = profile.projectPath;
                    if (!path) {
                        errorDiv.textContent = 'Error: Please enter a project path.';
                        return;
                    }
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                const allCodeBlocks = document.querySelectorAll('ms-code-block');
                                let copyButton = null;
                                if (allCodeBlocks.length > 0) {
                                    const lastCodeBlock = allCodeBlocks[allCodeBlocks.length - 1];
                                    copyButton = lastCodeBlock.querySelector('button[mattooltip="Copy to clipboard"]') ||
                                        Array.from(lastCodeBlock.querySelectorAll('button')).find(btn => btn.innerText.trim() === 'content_copy') ||
                                        lastCodeBlock.querySelector('button[aria-label="Copy"]') ||
                                        lastCodeBlock.querySelector('button[aria-label="Copy to clipboard"]');
                                }
                                if (!copyButton) {
                                    copyButton = Array.from(document.querySelectorAll('button[aria-label="Copy"]')).slice(-1)[0] ||
                                        Array.from(document.querySelectorAll('button[aria-label="Copy to clipboard"]')).slice(-1)[0];
                                }
                                if (!copyButton) {
                                    copyButton = document.evaluate("(//button[contains(., 'Copy')])[last()]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                                    if (copyButton) {
                                        const codeElement = copyButton.closest('.relative')?.querySelector('code');
                                        if (codeElement) {
                                            const t = document.createElement('textarea');
                                            t.value = codeElement.textContent;
                                            document.body.appendChild(t);
                                            t.select();
                                            document.execCommand('copy');
                                            t.remove();
                                            return { success: true };
                                        }
                                        return { error: 'Could not find code element near the last Copy button.' };
                                    }
                                }
                                if (copyButton) {
                                    copyButton.click();
                                    return { success: true };
                                }
                                return { error: 'No code blocks or Copy buttons found on the page.' };
                            }
                        });
                        if (results[0].result.error) {
                            errorDiv.textContent = `Error: ${results[0].result.error}`;
                            return;
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const codeToDeploy = await navigator.clipboard.readText();
                        if (!codeToDeploy || (!codeToDeploy.includes("EOCHANGEDFILE") && !codeToDeploy.includes("EOPROJECTFILE"))) {
                            errorDiv.textContent = 'Error: Clipboard content is not a valid deploy script.';
                            return;
                        }
                        const response = await fetch(`http://127.0.0.1:5010/deploycode?path=${encodeURIComponent(path)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/plain' },
                            body: codeToDeploy
                        });
                        const resultText = await response.text();
                        if (!response.ok) {
                            throw new Error(`Deploy failed: ${resultText}`);
                        }
                        errorDiv.textContent = 'Code deployed successfully!';
                        console.log('JustCode Deploy Result:', resultText);
                    } catch (error) {
                        errorDiv.textContent = `Error: ${error.message}`;
                        console.error('JustCode Error:', error);
                    }
                });
            });
        });

        document.querySelectorAll('.delete-profile').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                loadProfiles((profiles, activeProfileId) => {
                    if (profiles.length > 1) {
                        const updatedProfiles = profiles.filter(p => p.id !== id);
                        const newActiveProfileId = activeProfileId === id ? updatedProfiles[0].id : activeProfileId;
                        saveProfiles(updatedProfiles, newActiveProfileId);
                        renderProfiles(updatedProfiles, newActiveProfileId);
                    } else {
                        errorDiv.textContent = 'Cannot delete the last profile.';
                    }
                });
            });
        });
    }

    // Add new profile
    addProfileButton.addEventListener('click', () => {
        loadProfiles((profiles, activeProfileId) => {
            const newProfile = {
                id: Date.now(),
                name: `Profile ${profiles.length + 1}`,
                projectPath: '',
                copyToClipboard: true
            };
            profiles.push(newProfile);
            saveProfiles(profiles, newProfile.id);
            renderProfiles(profiles, newProfile.id);
        });
    });

    // Initial render
    loadProfiles(renderProfiles);
});
