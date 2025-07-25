export function getArchivedProfileHTML(profile) {
    const location = profile.useServerBackend ? profile.projectPath : 'Local JS Mode';
    const locationDisplay = location || 'No location set';
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