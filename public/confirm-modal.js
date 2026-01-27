// ============================================
// CUSTOM CONFIRM MODAL
// ============================================

/**
 * Custom confirm dialog to replace native confirm()
 * Prevents interference from browser extensions like MetaMask
 */
window.customConfirm = function (message, title = '⚠️ Confirmar acción') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const modalTitle = document.getElementById('confirmModalTitle');
        const modalMessage = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmModalConfirm');
        const cancelBtn = document.getElementById('confirmModalCancel');

        // Set content
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        // Show modal
        modal.style.display = 'flex';

        // Handle confirm
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        // Handle cancel
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // Handle click outside
        const handleClickOutside = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };

        // Cleanup function
        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleEscape);
            modal.removeEventListener('click', handleClickOutside);
        };

        // Add event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleEscape);
        modal.addEventListener('click', handleClickOutside);
    });
};
