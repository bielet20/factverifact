/**
 * Change Admin Password Script
 * Run this in production to change admin password without login
 * 
 * Usage:
 *   node change-admin-password.js <new-password>
 *   Example: node change-admin-password.js MyNewSecurePassword123
 */

const db = require('./database.js');
const { hashPassword } = require('./auth.js');

async function changeAdminPassword() {
    const newPassword = process.argv[2];

    if (!newPassword) {
        console.error('❌ Error: Please provide a new password');
        console.log('Usage: node change-admin-password.js <new-password>');
        process.exit(1);
    }

    if (newPassword.length < 6) {
        console.error('❌ Error: Password must be at least 6 characters');
        process.exit(1);
    }

    console.log('🔧 Changing admin password...');

    try {
        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        // Update admin password
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = 'admin'`,
                [passwordHash],
                function (err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Admin user not found'));
                    else resolve();
                }
            );
        });

        console.log('✅ Admin password changed successfully!');
        console.log('   Username: admin');
        console.log('   New password: ' + newPassword);
        console.log('   You can now login with the new password');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error changing password:', error.message);
        process.exit(1);
    }
}

// Wait for database to be ready
setTimeout(() => {
    changeAdminPassword();
}, 2000);
