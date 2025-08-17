/**
 * Centralized handler for server-related errors.
 * Constructs a user-friendly, informative error message.
 * @param {Error} error The error object caught.
 * @param {boolean} isServerModeActive Whether the current profile is in server mode.
 * @returns {string} The formatted error message.
 */
export function handleServerError(error, isServerModeActive) {
    if (isServerModeActive && error instanceof TypeError && error.message.includes('fetch')) {
        return `Error: Could not connect to the JustCode server. Please ensure it's running. See the <a href="https://github.com/achendev/justcode#running-the-server-optional" target="_blank" title="JustCode GitHub Repository">setup instructions</a> or switch to the Browser (JS) mode.`;
    }
    
    // For server-side errors that are not fetch errors (e.g., 500 internal server error),
    // we often want to remove the generic "Error:" prefix to avoid duplication.
    let errorMessage = error.message;
    if (errorMessage.startsWith('Error: ')) {
        errorMessage = errorMessage.substring(7);
    }

    return `Error: ${errorMessage}`;
}