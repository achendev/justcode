export async function rollbackCode(profile, errorDiv) {
    errorDiv.textContent = '';
    const path = profile.projectPath;
    if (!path) {
        errorDiv.textContent = 'Error: Project path is required for rollback.';
        return;
    }

    try {
        errorDiv.textContent = 'Attempting rollback...';
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const endpoint = `${serverUrl}/rollback?path=${encodeURIComponent(path)}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' }
        });

        const resultText = await response.text();
        if (!response.ok) {
            throw new Error(`Rollback failed: ${resultText}`);
        }

        errorDiv.textContent = 'Rollback successful!';
        console.log('JustCode Rollback Result:', resultText);

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message.replace('Error: Rollback failed: ', '')}`;
        console.error('JustCode Error:', error);
    }
}