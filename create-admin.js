/**
 * Manual Admin User Creation Script
 * Run this in production if automatic user creation fails
 * 
 * Usage:
 *   node create-admin.js
 */

const db = require('./database.js');
const { hashPassword } = require('./auth.js');

async function createAdminUser() {
    console.log('🔧 Creating admin user...');

    try {
        // Check if admin exists
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        if (adminExists) {
            console.log('✅ Admin user already exists');
            process.exit(0);
        }

        // Create admin user
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
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        process.exit(1);
    }
}

// Wait for database to be ready
setTimeout(() => {
    createAdminUser();
}, 2000);
