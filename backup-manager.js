const archiver = require('archiver');
const extract = require('extract-zip');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class BackupManager {
    constructor(backupDir = './backups', dbPath = './invoices.db', uploadsDir = './public/uploads') {
        this.backupDir = backupDir;
        this.dbPath = dbPath;
        this.uploadsDir = uploadsDir;
    }

    /**
     * Create a complete backup (database + uploads + audit)
     * @param {Array} auditTrail - Optional Veri*Factu audit trail data
     * @returns {Promise<Object>} Backup info
     */
    async createBackup(auditTrail = null) {
        try {
            // Ensure backup directory exists
            await fs.mkdir(this.backupDir, { recursive: true });

            // Generate backup filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
            const backupName = `backup-${timestamp}.zip`;
            const backupPath = path.join(this.backupDir, backupName);

            // Create metadata
            const metadata = {
                version: '1.1',
                timestamp: new Date().toISOString(),
                database: path.basename(this.dbPath),
                app_version: '1.0.0',
                verifactu_audit_included: !!auditTrail
            };

            // Count files in uploads
            let fileCount = 0;
            let totalSize = 0;

            if (fsSync.existsSync(this.uploadsDir)) {
                const files = await this.getFilesRecursive(this.uploadsDir);
                fileCount = files.length;
                for (const file of files) {
                    const stats = await fs.stat(file);
                    totalSize += stats.size;
                }
            }

            metadata.files = {
                count: fileCount,
                total_size: totalSize
            };

            // Create ZIP archive
            await this.createZipArchive(backupPath, metadata, auditTrail);

            // Get backup file stats
            const stats = await fs.stat(backupPath);

            console.log(`✅ Backup created: ${backupName}`);

            return {
                name: backupName,
                path: backupPath,
                size: stats.size,
                created: new Date().toISOString(),
                metadata
            };

        } catch (error) {
            console.error('Error creating backup:', error);
            throw error;
        }
    }

    /**
     * Verify database integrity
     * @param {Object} db - SQLite database connection
     * @returns {Promise<boolean>}
     */
    async verifyDbIntegrity(db) {
        return new Promise((resolve, reject) => {
            db.get('PRAGMA integrity_check', (err, row) => {
                if (err) reject(err);
                else {
                    const isValid = row.integrity_check === 'ok';
                    if (!isValid) console.warn('⚠️ Database integrity check failed:', row.integrity_check);
                    resolve(isValid);
                }
            });
        });
    }

    /**
     * Create ZIP archive with database, uploads and Veri*Factu audit
     */
    async createZipArchive(outputPath, metadata, auditTrail = null) {
        return new Promise((resolve, reject) => {
            const output = fsSync.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            output.on('close', () => {
                resolve();
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);

            // Add metadata
            archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

            // Add Veri*Factu Audit
            if (auditTrail) {
                archive.append(JSON.stringify(auditTrail, null, 2), { name: 'verifactu_audit.json' });
            }

            // Add database
            if (fsSync.existsSync(this.dbPath)) {
                archive.file(this.dbPath, { name: path.basename(this.dbPath) });
            }

            // Add uploads directory
            if (fsSync.existsSync(this.uploadsDir)) {
                archive.directory(this.uploadsDir, 'uploads');
            }

            archive.finalize();
        });
    }

    /**
     * List all available backups
     * @returns {Promise<Array>} Array of backup info
     */
    async listBackups() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });

            const files = await fs.readdir(this.backupDir);
            const backups = [];

            for (const file of files) {
                if (file.endsWith('.zip')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = await fs.stat(filePath);

                    backups.push({
                        name: file,
                        size: stats.size,
                        created: stats.mtime.toISOString(),
                        path: filePath
                    });
                }
            }

            // Sort by creation date (newest first)
            backups.sort((a, b) => new Date(b.created) - new Date(a.created));

            return backups;

        } catch (error) {
            console.error('Error listing backups:', error);
            throw error;
        }
    }

    /**
     * Restore backup from ZIP file
     * @param {string} backupPath Path to backup ZIP file
     */
    async restoreBackup(backupPath) {
        try {
            console.log(`🔄 Restoring backup from: ${backupPath}`);

            // Create safety backup before restore
            console.log('Creating safety backup...');
            const safetyBackup = await this.createBackup();
            console.log(`✅ Safety backup created: ${safetyBackup.name}`);

            // Create temporary extraction directory
            const tempDir = path.join(this.backupDir, 'temp-restore');
            await fs.mkdir(tempDir, { recursive: true });

            try {
                // Extract backup
                console.log('Extracting backup...');
                await extract(backupPath, { dir: path.resolve(tempDir) });

                // Validate metadata
                const metadataPath = path.join(tempDir, 'metadata.json');
                if (!fsSync.existsSync(metadataPath)) {
                    throw new Error('Invalid backup: metadata.json not found');
                }

                const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
                console.log('Backup metadata:', metadata);

                // Restore database
                const dbBackupPath = path.join(tempDir, metadata.database || 'invoices.db');
                if (fsSync.existsSync(dbBackupPath)) {
                    console.log('Restoring database...');
                    await fs.copyFile(dbBackupPath, this.dbPath);
                    console.log('✅ Database restored');
                }

                // Restore uploads
                const uploadsBackupPath = path.join(tempDir, 'uploads');
                if (fsSync.existsSync(uploadsBackupPath)) {
                    console.log('Restoring uploads...');

                    // Remove current uploads
                    if (fsSync.existsSync(this.uploadsDir)) {
                        await fs.rm(this.uploadsDir, { recursive: true, force: true });
                    }

                    // Copy backup uploads
                    await this.copyDirectory(uploadsBackupPath, this.uploadsDir);
                    console.log('✅ Uploads restored');
                }

                console.log('✅ Backup restored successfully');

            } finally {
                // Clean up temp directory
                if (fsSync.existsSync(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
            }

            return {
                success: true,
                safetyBackup: safetyBackup.name
            };

        } catch (error) {
            console.error('Error restoring backup:', error);
            throw error;
        }
    }

    /**
     * Delete a backup file
     * @param {string} backupName Name of backup file
     */
    async deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);

            if (!fsSync.existsSync(backupPath)) {
                throw new Error('Backup not found');
            }

            await fs.unlink(backupPath);
            console.log(`✅ Backup deleted: ${backupName}`);

            return { success: true };

        } catch (error) {
            console.error('Error deleting backup:', error);
            throw error;
        }
    }

    /**
     * Clean old backups (keep only last N backups)
     * @param {number} keepCount Number of backups to keep
     */
    async cleanOldBackups(keepCount = 30) {
        try {
            const backups = await this.listBackups();

            if (backups.length <= keepCount) {
                return { deleted: 0 };
            }

            const toDelete = backups.slice(keepCount);
            let deleted = 0;

            for (const backup of toDelete) {
                await this.deleteBackup(backup.name);
                deleted++;
            }

            console.log(`✅ Cleaned ${deleted} old backups`);
            return { deleted };

        } catch (error) {
            console.error('Error cleaning old backups:', error);
            throw error;
        }
    }

    /**
     * Helper: Get all files recursively
     */
    async getFilesRecursive(dir) {
        const files = [];
        const items = await fs.readdir(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
                const subFiles = await this.getFilesRecursive(fullPath);
                files.push(...subFiles);
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Helper: Copy directory recursively
     */
    async copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const items = await fs.readdir(src);

        for (const item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            const stats = await fs.stat(srcPath);

            if (stats.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }
}

module.exports = BackupManager;
