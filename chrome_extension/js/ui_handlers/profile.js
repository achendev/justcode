import { 
    handleAddProfile, 
    handleCopyProfile, 
    handleProfileNameChange 
} from './profile_actions/creation.js';

import { 
    handleArchiveProfile, 
    handleDirectPermanentDeleteProfile, 
    handlePermanentDeleteProfile, 
    handleRestoreProfile 
} from './profile_actions/state.js';

import { 
    handleMoveProfileLeft, 
    handleMoveProfileRight, 
    handleTabSwitch 
} from './profile_actions/navigation.js';

// This file acts as a facade, re-exporting all the profile handler functions
// from their new, more organized locations. This maintains a stable public API
// for other modules like event_listeners.js that import from here.

export {
    handleAddProfile,
    handleCopyProfile,
    handleProfileNameChange,
    handleArchiveProfile,
    handleDirectPermanentDeleteProfile,
    handlePermanentDeleteProfile,
    handleRestoreProfile,
    handleMoveProfileLeft,
    handleMoveProfileRight,
    handleTabSwitch
};