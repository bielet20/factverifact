/**
 * Database Migration: Password Reset System
 * Adds password_reset_tokens table and is_root column to users
 */

const db = require('./database.js');

async function migrate() {
    console.log('🔧 Running password reset migration...');

    try {
        // Create password_reset_tokens table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ password_reset_tokens table created');

        // Add is_root column to users table
        await new Promise((resolve, reject) => {
            db.run(`
                ALTER TABLE users ADD COLUMN is_root INTEGER DEFAULT 0
            `, (err) => {
                // Ignore error if column already exists
                if (err && !err.message.includes('duplicate column')) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        console.log('✅ is_root column added to users table');

        console.log('✅ Password reset migration completed successfully');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
