import * as messageHandlers from '../ui_handlers/message.js';

export function attachMessageEventListeners() {
    document.querySelectorAll('.close-message').forEach(button => {
        button.addEventListener('click', messageHandlers.handleCloseMessage);
    });
}