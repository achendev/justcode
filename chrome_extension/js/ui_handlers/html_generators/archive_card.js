export function getArchivedProfileHTML(profile) {
    let locationDisplay = 'No location set';
    if (profile.useServerBackend) {
        // Use the first non-empty path for display
        locationDisplay = (profile.projectPaths && profile.projectPaths.find(p => p)) || 'No path set';
    } else {
        // Use the first non-empty folder name for display
        const folderName = (profile.jsProjectFolderNames && profile.jsProjectFolderNames.find(name => name));
        locationDisplay = folderName ? `JS: ${folderName}` : 'JS: No folder selected';
    }
    
    return `
    <div class="archived-profile-card">
        <button class="btn btn-outline-success btn-sm restore-profile" data-id="${profile.id}" title="Restore Profile"><i class="bi bi-upload"></i></button>
        <div class="profile-info">
            <strong title="${profile.name}">${profile.name}</strong>
            <small class="text-muted" title="${locationDisplay}">${locationDisplay}</small>
        </div>
        <button class="btn btn-outline-danger btn-sm permanent-delete-profile" data-id="${profile.id}" title="Delete Permanently"><i class="bi bi-trash"></i></button>
    </div>
    `;
}