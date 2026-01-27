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
    restoreBackupBtn.addEventListener('click', restoreBackup);
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
            alert('✅ Backup creado exitosamente: ' + result.backup.name);
            loadBackups(); // Reload list
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        alert('Error al crear backup');
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
                <button class="btn-secondary" onclick="downloadBackup('${backup.name}')">
                    ⬇️ Descargar
                </button>
                <button class="btn-danger" onclick="deleteBackup('${backup.name}')">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Download a backup
 */
function downloadBackup(backupName) {
    window.location.href = `/api/backups/${backupName}/download`;
}

/**
 * Restore a backup
 */
async function restoreBackup() {
    const file = backupFileInput.files[0];

    if (!file) {
        alert('Por favor selecciona un archivo de backup');
        return;
    }

    if (!file.name.endsWith('.zip')) {
        alert('El archivo debe ser un ZIP');
        return;
    }

    const confirmed = confirm(
        '⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n' +
        'Esta acción sobrescribirá TODOS los datos actuales:\n' +
        '- Base de datos completa\n' +
        '- Todos los archivos subidos\n\n' +
        'Se creará un backup de seguridad automáticamente antes de restaurar.\n\n' +
        '¿Estás SEGURO de que deseas continuar?'
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

        const result = await response.json();

        if (response.ok) {
            alert(
                '✅ Backup restaurado exitosamente!\n\n' +
                'Backup de seguridad creado: ' + result.safetyBackup + '\n\n' +
                'La página se recargará ahora.'
            );

            // Reload page to reflect restored data
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            alert('Error al restaurar backup: ' + result.error);
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        alert('Error al restaurar backup');
    } finally {
        restoreBackupBtn.disabled = false;
        restoreBackupBtn.textContent = 'Restaurar Backup';
        backupFileInput.value = '';
    }
}

/**
 * Delete a backup
 */
async function deleteBackup(backupName) {
    if (!confirm(`¿Eliminar el backup "${backupName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/backups/${backupName}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Backup eliminado');
            loadBackups();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
        alert('Error al eliminar backup');
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
