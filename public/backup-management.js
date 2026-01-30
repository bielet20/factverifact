// ============================================
// BACKUP MANAGEMENT (Admin only)
// ============================================

const createBackupBtn = document.getElementById('createBackupBtn');
const restoreBackupBtn = document.getElementById('restoreBackupBtn');
const backupFileInput = document.getElementById('backupFileInput');
const backupsTableBody = document.getElementById('backupsTableBody');
const backupsTab = document.getElementById('backupsTab');

// Event Listeners
if (createBackupBtn) {
    createBackupBtn.addEventListener('click', createBackup);
}

if (restoreBackupBtn) {
    restoreBackupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        restoreBackup();
    });
}

// Load backups when tab is opened
if (backupsTab) {
    backupsTab.addEventListener('click', () => {
        if (currentUser && currentUser.role === 'admin') {
            loadBackups();
        }
    });
}

/**
 * Create a new backup
 */
async function createBackup() {
    try {
        createBackupBtn.disabled = true;
        createBackupBtn.textContent = 'Creando backup...';

        const response = await fetch('/api/backups/create', {
            method: 'POST',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            window.showNotification('✅ Backup creado exitosamente: ' + result.backup.name, 'success');
            loadBackups(); // Reload list
        } else {
            window.showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        window.showNotification('Error al crear backup', 'error');
    } finally {
        createBackupBtn.disabled = false;
        createBackupBtn.textContent = '+ Crear Backup';
    }
}

/**
 * Load and display list of backups
 */
async function loadBackups() {
    try {
        const response = await fetch('/api/backups', {
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            renderBackupsTable(result.backups);
        } else {
            console.error('Error loading backups:', result.error);
        }
    } catch (error) {
        console.error('Error loading backups:', error);
    }
}

/**
 * Render backups table
 */
function renderBackupsTable(backups) {
    if (!backupsTableBody) return;

    if (backups.length === 0) {
        backupsTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #666;">
                    No hay backups disponibles
                </td>
            </tr>
        `;
        return;
    }

    backupsTableBody.innerHTML = backups.map(backup => `
        <tr>
            <td>${backup.name}</td>
            <td>${new Date(backup.created).toLocaleString('es-ES')}</td>
            <td>${formatFileSize(backup.size)}</td>
            <td>
                <button type="button" class="btn-secondary" onclick="downloadBackup('${backup.name}')">
                    ⬇️ Descargar
                </button>
                <button type="button" class="btn-danger" onclick="deleteBackup('${backup.name}')">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Download a backup
 */
window.downloadBackup = function (backupName) {
    window.location.href = `/api/backups/${backupName}/download`;
}

/**
 * Restore a backup
 */
async function restoreBackup() {
    const file = backupFileInput.files[0];

    if (!file) {
        window.showNotification('Por favor selecciona un archivo de backup', 'warning');
        return;
    }

    if (!file.name.endsWith('.zip')) {
        window.showNotification('El archivo debe ser un ZIP', 'error');
        return;
    }

    const confirmed = await window.customConfirm(
        'Esta acción sobrescribirá TODOS los datos actuales (Base de datos y archivos subidos). Se creará un backup de seguridad automáticamente.',
        '⚠️ ADVERTENCIA CRÍTICA'
    );

    if (!confirmed) return;

    try {
        restoreBackupBtn.disabled = true;
        restoreBackupBtn.textContent = 'Restaurando...';

        const formData = new FormData();
        formData.append('backup', file);

        const response = await fetch('/api/backups/restore', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const contentType = response.headers.get('content-type');
        let result;
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const textError = await response.text();
            console.error('Non-JSON error from server:', textError);
            throw new Error('El servidor devolvió un error inesperado (consulte la consola)');
        }

        if (response.ok) {
            window.showNotification(
                '✅ Backup restaurado exitosamente! La página se recargará ahora.',
                'success'
            );

            // Reload page to reflect restored data
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            window.showNotification('Error al restaurar backup: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        window.showNotification('Error al restaurar backup', 'error');
    } finally {
        restoreBackupBtn.disabled = false;
        restoreBackupBtn.textContent = 'Restaurar Backup';
        backupFileInput.value = '';
    }
}

/**
 * Delete a backup
 */
window.deleteBackup = async function (backupName) {
    const confirmed = await window.customConfirm(
        `¿Eliminar el backup "${backupName}"?`,
        '🗑️ Eliminar Backup'
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/backups/${backupName}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            window.showNotification('✅ Backup eliminado', 'success');
            loadBackups();
        } else {
            window.showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
        window.showNotification('Error al eliminar backup', 'error');
    }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
