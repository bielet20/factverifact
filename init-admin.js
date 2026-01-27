/**
 * Initialize Admin User
 * 
 * This script ensures that an admin user exists in the database.
 * Run this on first deployment or if admin user is missing.
 * 
 * Usage: node init-admin.js
 */

const db = require('./database.js');
const { hashPassword } = require('./auth.js');

async function initializeAdminUser() {
    console.log('🔧 Checking for admin user...');

    try {
        // Check if admin user exists
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        if (adminExists) {
            console.log('✅ Admin user already exists');
            process.exit(0);
            return;
        }

        console.log('📝 Creating admin user...');

        // Create admin user with default password
        const passwordHash = await hashPassword('admin123');

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO users (username, password_hash, full_name, email, role, is_active, must_change_password) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['admin', passwordHash, 'Administrador', 'admin@example.com', 'admin', 1, 1],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        console.log('✅ Admin user created successfully!');
        console.log('');
        console.log('📋 Login credentials:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('');
        console.log('⚠️  IMPORTANT: Change the password after first login!');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error initializing admin user:', error);
        process.exit(1);
    }
}

// Run initialization
initializeAdminUser();
