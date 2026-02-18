const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const dbPath = '/tmp/invoices_fact.db';
const SALT_ROUNDS = 10;

async function resetPassword() {
    console.log('🔧 Resetting admin password in /tmp/invoices_fact.db...');

    const db = new sqlite3.Database(dbPath);
    const newPassword = 'admin123';

    try {
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?', [hash, 'admin'], function (err) {
                if (err) reject(err);
                else {
                    console.log(`✅ Password updated for user "admin". Changes: ${this.changes}`);
                    resolve();
                }
            });
        });

        // Also ensure root is reset just in case
        const rootHash = await bcrypt.hash('root123', SALT_ROUNDS);
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?', [rootHash, 'root'], function (err) {
                if (err) reject(err);
                else {
                    console.log(`✅ Password updated for user "root". Changes: ${this.changes}`);
                    resolve();
                }
            });
        });

        db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

resetPassword();
