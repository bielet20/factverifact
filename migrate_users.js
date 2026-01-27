const db = require('./database');
const { hashPassword } = require('./auth');

async function createInitialAdminUser() {
    const username = 'admin';
    const password = 'admin123';
    const fullName = 'Administrador';
    const role = 'admin';

    try {
        // Check if admin user already exists
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            console.log('Admin user already exists.');
            return;
        }

        // Create admin user
        const passwordHash = await hashPassword(password);

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO users (username, password_hash, full_name, role, must_change_password) 
                 VALUES (?, ?, ?, ?, 1)`,
                [username, passwordHash, fullName, role],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        console.log('✅ Admin user created successfully!');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change this password on first login!');
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
}

// Run migration
setTimeout(() => {
    createInitialAdminUser().then(() => {
        console.log('User migration completed.');
        process.exit(0);
    });
}, 1000);
