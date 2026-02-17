const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('./database.js');
const { generateInvoicePDF } = require('./pdfGenerator.js');
const verifactu = require('./verifactu.js');
const { hashPassword, verifyPassword, requireAuth, requireRole, getCurrentUser } = require('./auth.js');
const emailService = require('./email-service.js');
const BackupManager = require('./backup-manager.js');
const cron = require('node-cron');

const app = express();
const HTTP_PORT = process.env.PORT || 3000;

// Configurar BackupManager con rutas persistentes
const isDocker = fs.existsSync('/app/data');
// FOR TESTING ON MAC: Use /tmp for everything to avoid permission issues
const TEST_TMP_ROOT = '/tmp/factapp';
if (!fs.existsSync(TEST_TMP_ROOT)) fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });

// Redirigir TMPDIR para Puppeteer y otros procesos temporales
process.env.TMPDIR = path.join(TEST_TMP_ROOT, 'tmp');
if (!fs.existsSync(process.env.TMPDIR)) fs.mkdirSync(process.env.TMPDIR, { recursive: true });

const backupDir = process.env.BACKUP_PATH || (isDocker ? '/app/data/backups' : path.join(TEST_TMP_ROOT, 'backups'));
const dbPath = process.env.DB_PATH || (isDocker ? '/app/data/invoices.db' : '/tmp/invoices_fact.db');
const uploadsDirForBackup = process.env.UPLOADS_PATH || (isDocker ? '/app/data/uploads/logos' : path.join(TEST_TMP_ROOT, 'uploads', 'logos'));

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(path.dirname(uploadsDirForBackup))) fs.mkdirSync(path.dirname(uploadsDirForBackup), { recursive: true });

const backupManager = new BackupManager(backupDir, dbPath, uploadsDirForBackup);

// Database Persistence & Fallback Logic
const rootDbPath = path.join(__dirname, 'data', 'invoices.db');

console.log(`[Persistence] Initializing...`);
console.log(`[Persistence] Volume DB Path: ${dbPath} (exists: ${fs.existsSync(dbPath)})`);
console.log(`[Persistence] Bundled DB Path: ${rootDbPath} (exists: ${fs.existsSync(rootDbPath)})`);

if (isDocker) {
    // Only copy from root if the persistent volume is empty
    if (!fs.existsSync(dbPath) && fs.existsSync(rootDbPath)) {
        console.log('📦 Persistent volume empty. Falling back to bundled invoices.db...');
        try {
            fs.copyFileSync(rootDbPath, dbPath);
            console.log('✅ Database restored from bundle successfully.');
        } catch (err) {
            console.error('❌ Error during database fallback:', err);
        }
    } else if (!fs.existsSync(dbPath)) {
        console.log('ℹ️ No persistent database and no bundle found. A fresh database will be created.');
    } else {
        console.log('✅ Using existing database from persistent volume.');
    }
}

// Trust proxy - CRITICAL for production behind reverse proxy (Coolify, SSL termination, etc)
app.set('trust proxy', true); // Trust all proxies in the chain

// Global Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

// Session configuration
app.use(session({
    name: 'sid', // Nombre de cookie simple
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: true,
    saveUninitialized: true,
    proxy: true,
    cookie: {
        secure: false, // Forzar false para HTTP/Production (sslip.io)
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// CORS configuration - simplify for production debugging
app.use(cors({
    origin: function (origin, callback) {
        // En producción, permitimos cualquier origen con credenciales
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Debugging Middleware - LOG ALL COOKIES
app.use((req, res, next) => {
    console.log(`[Request Log] ${req.method} ${req.url}`);
    console.log(`[Request Log] Cookie Header: ${req.headers.cookie || 'NONE'}`);
    if (req.session) {
        console.log(`[Request Log] Session ID: ${req.sessionID}`);
        console.log(`[Request Log] Auth User: ${req.session.user ? req.session.user.username : 'NONE'}`);
    }
    next();
});

// Debug session middleware (only in dev/debug)
app.use((req, res, next) => {
    if (process.env.DEBUG_SESSION === 'true' || process.env.NODE_ENV !== 'production') {
        console.log(`[Session Debug] ${req.method} ${req.url} - Session ID: ${req.sessionID} - Has User: ${!!req.session.user}`);
    }
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
// Create uploads directory in persistent volume
const uploadsDir = process.env.UPLOADS_PATH || (fs.existsSync('/app/data') ? '/app/data/uploads/logos' : '/tmp/factapp/uploads/logos');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for logo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'company-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WebP)'));
        }
    }
})

    ;

// Separate multer for database uploads
const dbUpload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Dedicated multer for backup restoration (Zips)
const backupUpload = multer({
    dest: 'backups/temp/',
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos ZIP para restauración'));
        }
    }
});


// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    try {
        db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], async (err, user) => {
            if (err) {
                console.error(`[Login Error] Database error for user ${username}:`, err);
                return res.status(500).json({ error: 'Error del servidor' });
            }

            if (!user) {
                console.warn(`[Login Warning] User not found or inactive: ${username}`);
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                console.warn(`[Login Warning] Invalid password for user: ${username}`);
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }

            console.log(`[Auth Log] Successful login: ${username}`);

            // Update last login
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

            // Create session
            req.session.user = {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                must_change_password: user.must_change_password
            };

            // Save session before sending response to ensure next request finds it
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ error: 'Error al iniciar sesión' });
                }
                res.json({
                    message: 'Login exitoso',
                    user: req.session.user
                });
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.json({ message: 'Sesión cerrada exitosamente' });
    });
});

// Get current session
app.get('/api/auth/session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ error: 'No hay sesión activa' });
    }
});

// Change password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { current_password, new_password } = req.body;
    const userId = req.session.user.id;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (new_password.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    try {
        db.get('SELECT password_hash, must_change_password, username FROM users WHERE id = ?', [userId], async (err, user) => {
            if (err || !user) {
                return res.status(500).json({ error: 'Error del servidor' });
            }

            const wasMustChangePassword = user.must_change_password === 1;
            const username = user.username;

            const isValid = await verifyPassword(current_password, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ error: 'Contraseña actual incorrecta' });
            }

            const newHash = await hashPassword(new_password);
            db.run(
                'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
                [newHash, userId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error al cambiar contraseña' });
                    }

                    // Update session
                    req.session.user.must_change_password = 0;

                    req.session.save((err) => {
                        if (err) console.error('Session save error after password change:', err);

                        // Si es el primer cambio de contraseña tras instalación (solo para admin)
                        if (wasMustChangePassword && username === 'admin') {
                            console.log('📦 Realizando backup automático post-instalación...');
                            backupManager.createBackup().then(backup => {
                                console.log('✅ Backup post-instalación creado:', backup.name);
                            }).catch(err => {
                                console.error('❌ Error en backup automático:', err);
                            });
                        }

                        res.json({ message: 'Contraseña cambiada exitosamente' });
                    });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Forgot password - Request password reset
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email es requerido' });
    }

    try {
        // Find user by email
        db.get('SELECT id, username, full_name, email FROM users WHERE email = ? AND is_active = 1', [email], async (err, user) => {
            if (err) {
                console.error('Database error:', err);
                // Don't reveal if email exists
                return res.json({ message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña' });
            }

            if (!user) {
                // Don't reveal if email exists
                return res.json({ message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña' });
            }

            // Generate secure token
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

            // Save token to database
            db.run(
                'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                [user.id, token, expiresAt.toISOString()],
                async (err) => {
                    if (err) {
                        console.error('Error saving reset token:', err);
                        return res.status(500).json({ error: 'Error del servidor' });
                    }

                    // Send email
                    try {
                        await emailService.sendPasswordResetEmail(user.email, token, user.full_name);
                        console.log(`✅ Password reset email sent to ${user.email}`);
                    } catch (emailError) {
                        console.error('Error sending email:', emailError);
                        // Continue anyway - token is saved
                    }

                    res.json({ message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña' });
                }
            );
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Verify reset token
app.get('/api/auth/verify-token/:token', (req, res) => {
    const { token } = req.params;

    db.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0',
        [token],
        (err, resetToken) => {
            if (err) {
                return res.status(500).json({ error: 'Error del servidor' });
            }

            if (!resetToken) {
                return res.status(400).json({ error: 'Token inválido' });
            }

            if (new Date() > new Date(resetToken.expires_at)) {
                return res.status(400).json({ error: 'Token expirado' });
            }

            res.json({ valid: true });
        }
    );
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        // Verify token
        db.get(
            'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0',
            [token],
            async (err, resetToken) => {
                if (err) {
                    return res.status(500).json({ error: 'Error del servidor' });
                }

                if (!resetToken) {
                    return res.status(400).json({ error: 'Token inválido o ya utilizado' });
                }

                if (new Date() > new Date(resetToken.expires_at)) {
                    return res.status(400).json({ error: 'Token expirado' });
                }

                // Update password
                const passwordHash = await hashPassword(newPassword);

                db.run(
                    'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
                    [passwordHash, resetToken.user_id],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error al actualizar contraseña' });
                        }

                        // Mark token as used
                        db.run(
                            'UPDATE password_reset_tokens SET used = 1 WHERE token = ?',
                            [token],
                            (err) => {
                                if (err) {
                                    console.error('Error marking token as used:', err);
                                }

                                res.json({ message: 'Contraseña actualizada exitosamente' });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// USER MANAGEMENT ENDPOINTS (Admin only)
// ============================================

// List all users
app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
    db.all('SELECT id, username, full_name, email, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});

// Create new user
app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    const { username, password, full_name, email, role } = req.body;

    if (!username || !password || !full_name || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (!['admin', 'user', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const passwordHash = await hashPassword(password);

        db.run(
            `INSERT INTO users (username, password_hash, full_name, email, role) 
             VALUES (?, ?, ?, ?, ?)`,
            [username, passwordHash, full_name, email || null, role],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    message: 'Usuario creado exitosamente',
                    id: this.lastID
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Update user
app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const { username, full_name, email, role, is_active, password } = req.body;
    const userId = req.params.id;

    if (!username || !full_name || !role) {
        return res.status(400).json({ error: 'Usuario, nombre completo y rol son requeridos' });
    }

    if (!['admin', 'user', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    try {
        let sql = `UPDATE users SET username = ?, full_name = ?, email = ?, role = ?, is_active = ?`;
        let params = [username, full_name, email || null, role, is_active !== undefined ? is_active : 1];

        if (password && password.trim().length >= 6) {
            const passwordHash = await hashPassword(password);
            sql += `, password_hash = ?`;
            params.push(passwordHash);
        } else if (password && password.trim().length > 0) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        sql += ` WHERE id = ?`;
        params.push(userId);

        db.run(sql, params, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            res.json({ message: 'Usuario actualizado exitosamente' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Get next invoice number for a company (suggestion)
app.get('/api/companies/:id/next-invoice-number', requireAuth, async (req, res) => {
    const companyId = req.params.id;

    try {
        const company = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM companies WHERE id = ?', [companyId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!company) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        const nextSequence = (company.last_invoice_sequence || 0) + 1;
        let finalSequence = nextSequence;
        let nextNumber = verifactu.formatInvoiceNumber(finalSequence, company.verifactu_enabled);

        // Check if this number is already used by a draft or other invoice
        let exists = true;
        while (exists) {
            const check = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM invoices WHERE company_id = ? AND invoice_number = ?', [companyId, nextNumber], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (check) {
                finalSequence++;
                nextNumber = verifactu.formatInvoiceNumber(finalSequence, company.verifactu_enabled);
            } else {
                exists = false;
            }
        }

        res.json({
            next_invoice_number: nextNumber,
            sequence: finalSequence,
            year: new Date().getFullYear()
        });
    } catch (error) {
        console.error('Error calculating next invoice number:', error);
        res.status(500).json({ error: 'Error al calcular el siguiente número de factura' });
    }
});

// Delete/deactivate user
app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
    const userId = req.params.id;

    // Don't allow deleting yourself
    if (parseInt(userId) === req.session.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    // Check if trying to delete a protected user (admin or root)
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Protect admin and root users from deletion
        if (user.username === 'admin' || user.username === 'root') {
            return res.status(403).json({
                error: 'No se puede eliminar el usuario administrador principal'
            });
        }

        // Proceed with deactivation
        db.run(
            'UPDATE users SET is_active = 0 WHERE id = ?',
            [userId],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Usuario desactivado exitosamente' });
            }
        );
    });
});

// ============================================
// COMPANY MANAGEMENT ENDPOINTS
// ============================================

// Root endpoint - redirect to login if not authenticated
app.get('/', (req, res) => {
    if (!req.session || !req.session.user) {
        res.redirect('/login.html');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Login page redirect (handle /login without .html)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Company Management Endpoints

// Create a new company
app.post('/api/companies', requireAuth, (req, res) => {
    var errors = []
    if (!req.body.company_name) {
        errors.push("Company name is required");
    }
    if (!req.body.cif) {
        errors.push("CIF is required");
    }
    if (errors.length) {
        res.status(400).json({ "error": errors.join(",") });
        return;
    }
    var data = {
        company_name: req.body.company_name,
        cif: req.body.cif,
        address: req.body.address || '',
        phone: req.body.phone || '',
        email: req.body.email || '',
        bank_iban: req.body.bank_iban || '',
        verifactu_enabled: req.body.verifactu_enabled || 0,
        verifactu_software_id: req.body.verifactu_software_id || null,
        verifactu_certificate: req.body.verifactu_certificate || null,
        verifactu_certificate_password: req.body.verifactu_certificate_password || null
    }
    var sql = 'INSERT INTO companies (company_name, cif, address, phone, email, bank_iban, verifactu_enabled, verifactu_software_id, verifactu_certificate, verifactu_certificate_password) VALUES (?,?,?,?,?,?,?,?,?,?)'
    var params = [data.company_name, data.cif, data.address, data.phone, data.email, data.bank_iban, data.verifactu_enabled, data.verifactu_software_id, data.verifactu_certificate, data.verifactu_certificate_password]
    db.run(sql, params, function (err, result) {
        if (err) {
            res.status(400).json({ "error": err.message })
            return;
        }
        res.json({
            "message": "success",
            "data": data,
            "id": this.lastID
        })
    });
});

// List all companies
app.get('/api/companies', requireAuth, (req, res) => {
    var sql = "SELECT * FROM companies ORDER BY company_name"
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        })
    });
});

// Update a company
app.put('/api/companies/:id', requireAuth, (req, res) => {
    const companyId = req.params.id;
    const {
        company_name,
        cif,
        address,
        phone,
        email,
        bank_iban,
        verifactu_enabled,
        verifactu_software_id,
        verifactu_certificate,
        verifactu_certificate_password
    } = req.body;

    if (!company_name || !cif) {
        return res.status(400).json({ error: 'El nombre y el CIF son requeridos' });
    }

    const sql = `UPDATE companies SET 
                company_name = ?, 
                cif = ?, 
                address = ?, 
                phone = ?, 
                email = ?, 
                bank_iban = ?, 
                verifactu_enabled = ?, 
                verifactu_software_id = ?,
                verifactu_certificate = ?,
                verifactu_certificate_password = ?
                WHERE id = ?`;

    const params = [
        company_name,
        cif,
        address || '',
        phone || '',
        email || '',
        bank_iban || '',
        verifactu_enabled || 0,
        verifactu_software_id || null,
        verifactu_certificate || null,
        verifactu_certificate_password || null,
        companyId
    ];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(400).json({ "error": err.message });
        }
        res.json({
            "message": "success",
            "changes": this.changes
        });
    });
});

// Update Veri*Factu settings for a company
app.put('/api/companies/:id/verifactu', requireAuth, (req, res) => {
    const companyId = req.params.id;
    const verifactuEnabled = req.body.verifactu_enabled ? 1 : 0;
    const softwareId = req.body.verifactu_software_id || null;

    db.run(
        'UPDATE companies SET verifactu_enabled = ?, verifactu_software_id = ? WHERE id = ?',
        [verifactuEnabled, softwareId, companyId],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.json({
                "message": "success",
                "changes": this.changes
            });
        }
    );
});

// Delete a company
app.delete('/api/companies/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM companies WHERE id = ?', req.params.id, function (err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ "message": "deleted", "rows": this.changes })
    });
});

// Upload company logo
app.post('/api/companies/:id/logo', requireAuth, upload.single('logo'), (req, res) => {
    const companyId = req.params.id;

    if (!req.file) {
        return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
    }

    // Get current logo to delete it
    db.get('SELECT logo FROM companies WHERE id = ?', [companyId], (err, company) => {
        if (err) {
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: err.message });
        }

        if (!company) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Delete old logo file if exists
        if (company.logo) {
            const oldLogoPath = path.join(__dirname, 'public', company.logo);
            if (fs.existsSync(oldLogoPath)) {
                fs.unlinkSync(oldLogoPath);
            }
        }

        // Save new logo path
        const logoPath = `/uploads/logos/${req.file.filename}`;

        db.run('UPDATE companies SET logo = ? WHERE id = ?', [logoPath, companyId], function (err) {
            if (err) {
                fs.unlinkSync(req.file.path);
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: 'Logo subido exitosamente',
                logo: logoPath
            });
        });
    });
});

// Delete company logo
app.delete('/api/companies/:id/logo', requireAuth, (req, res) => {
    const companyId = req.params.id;

    db.get('SELECT logo FROM companies WHERE id = ?', [companyId], (err, company) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!company) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!company.logo) {
            return res.status(400).json({ error: 'La empresa no tiene logo' });
        }

        // Delete logo file
        const logoPath = path.join(__dirname, 'public', company.logo);
        if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
        }

        // Update database
        db.run('UPDATE companies SET logo = NULL WHERE id = ?', [companyId], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({ message: 'Logo eliminado exitosamente' });
        });
    });
});


// ============================================
// CLIENT MANAGEMENT ENDPOINTS
// ============================================

// List all clients
app.get('/api/clients', requireAuth, (req, res) => {
    var sql = "SELECT * FROM clients WHERE is_active = 1 ORDER BY name"
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        })
    });
});

// Get a single client
app.get('/api/clients/:id', requireAuth, (req, res) => {
    var sql = "SELECT * FROM clients WHERE id = ?"
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": row
        })
    });
});

// Create a new client
app.post('/api/clients', requireAuth, (req, res) => {
    const { name, cif, address, email, phone, client_type } = req.body;

    if (!name || !cif) {
        return res.status(400).json({ error: 'El nombre y el CIF son requeridos' });
    }

    const sql = `INSERT INTO clients (name, cif, address, email, phone, client_type) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [name, cif, address || '', email || '', phone || '', client_type || 'empresa'];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(400).json({ "error": err.message });
        }
        res.json({
            "message": "success",
            "id": this.lastID
        });
    });
});

// Update a client
app.put('/api/clients/:id', requireAuth, (req, res) => {
    const clientId = req.params.id;
    const { name, cif, address, email, phone, client_type } = req.body;

    if (!name || !cif) {
        return res.status(400).json({ error: 'El nombre y el CIF son requeridos' });
    }

    const sql = `UPDATE clients SET 
                name = ?, 
                cif = ?, 
                address = ?, 
                email = ?, 
                phone = ?, 
                client_type = ? 
                WHERE id = ?`;
    const params = [name, cif, address || '', email || '', phone || '', client_type || 'empresa', clientId];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(400).json({ "error": err.message });
        }
        res.json({
            "message": "success",
            "changes": this.changes
        });
    });
});

// Delete/deactivate a client
app.delete('/api/clients/:id', requireAuth, (req, res) => {
    const clientId = req.params.id;

    // We do a soft delete by setting is_active = 0
    db.run('UPDATE clients SET is_active = 0 WHERE id = ?', [clientId], function (err) {
        if (err) {
            return res.status(400).json({ "error": err.message });
        }
        res.json({
            "message": "success",
            "changes": this.changes
        });
    });
});

// Articles Management Endpoints

// Create a new article
app.post('/api/articles', requireAuth, (req, res) => {
    var errors = []
    if (!req.body.name) {
        errors.push("Article name is required");
    }
    if (req.body.unit_price === undefined || req.body.unit_price === null) {
        errors.push("Unit price is required");
    }
    if (errors.length) {
        res.status(400).json({ "error": errors.join(",") });
        return;
    }
    var data = {
        code: req.body.code || null,
        name: req.body.name,
        description: req.body.description || '',
        unit_price: req.body.unit_price,
        vat_rate: req.body.vat_rate || 21,
        category: req.body.category || '',
        is_active: req.body.is_active !== undefined ? req.body.is_active : 1
    }
    var sql = 'INSERT INTO articles (code, name, description, unit_price, vat_rate, category, is_active) VALUES (?,?,?,?,?,?,?)'
    var params = [data.code, data.name, data.description, data.unit_price, data.vat_rate, data.category, data.is_active]
    db.run(sql, params, function (err, result) {
        if (err) {
            res.status(400).json({ "error": err.message })
            return;
        }
        res.json({
            "message": "success",
            "data": data,
            "id": this.lastID
        })
    });
});

// List all articles
app.get('/api/articles', requireAuth, (req, res) => {
    var sql = "SELECT * FROM articles WHERE is_active = 1 ORDER BY name"
    var params = []

    if (req.query.search) {
        sql = "SELECT * FROM articles WHERE is_active = 1 AND (name LIKE ? OR code LIKE ? OR description LIKE ?) ORDER BY name"
        const searchTerm = `%${req.query.search}%`
        params = [searchTerm, searchTerm, searchTerm]
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        })
    });
});

// Get a single article
app.get('/api/articles/:id', requireAuth, (req, res) => {
    var sql = "SELECT * FROM articles WHERE id = ?"
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": row
        })
    });
});

// Update an article
app.put('/api/articles/:id', requireAuth, (req, res) => {
    var data = {
        code: req.body.code,
        name: req.body.name,
        description: req.body.description,
        unit_price: req.body.unit_price,
        vat_rate: req.body.vat_rate,
        category: req.body.category,
        is_active: req.body.is_active
    }
    db.run(
        `UPDATE articles SET 
            code = COALESCE(?, code),
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            unit_price = COALESCE(?, unit_price),
            vat_rate = COALESCE(?, vat_rate),
            category = COALESCE(?, category),
            is_active = COALESCE(?, is_active),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [data.code, data.name, data.description, data.unit_price, data.vat_rate, data.category, data.is_active, req.params.id],
        function (err, result) {
            if (err) {
                res.status(400).json({ "error": err.message })
                return;
            }
            res.json({
                "message": "success",
                "data": data,
                "changes": this.changes
            })
        });
});

// Delete an article (soft delete)
app.delete('/api/articles/:id', requireAuth, (req, res) => {
    db.run('UPDATE articles SET is_active = 0 WHERE id = ?', req.params.id, function (err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ "message": "deleted", "changes": this.changes })
    });
});

// Invoice Management Endpoints

// Create a new invoice with multiple line items and Veri*Factu support
app.post('/api/invoices', requireAuth, async (req, res) => {
    var errors = []
    if (!req.body.invoice_number && req.body.status === 'final') {
        errors.push("No invoice number specified for final invoice");
    }
    if (!req.body.company_id) {
        errors.push("Company is required");
    }
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        errors.push("At least one invoice item is required");
    } else {
        // Validation for each item
        req.body.items.forEach((item, index) => {
            if (!item.description || !item.description.trim()) {
                errors.push(`Línea ${index + 1}: La descripción es requerida`);
            }
            if (!item.unit_price || item.unit_price <= 0) {
                errors.push(`Línea ${index + 1}: El precio unitario debe ser mayor a 0`);
            }
            if (!item.quantity || item.quantity <= 0) {
                errors.push(`Línea ${index + 1}: La cantidad debe ser mayor a 0`);
            }
        });
    }
    if (!req.body.client_name || !req.body.client_name.trim()) {
        errors.push("El nombre del cliente es requerido");
    }
    if (!req.body.client_cif || !req.body.client_cif.trim()) {
        errors.push("El NIF/CIF del cliente es requerido");
    }
    if (errors.length) {
        res.status(400).json({ "error": errors.join(",") });
        return;
    }

    try {
        // Get company data to check Veri*Factu status
        const company = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM companies WHERE id = ?', [req.body.company_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!company) {
            res.status(404).json({ "error": "Company not found" });
            return;
        }

        // Check if invoice number already exists for this company
        const existingInvoice = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM invoices WHERE company_id = ? AND invoice_number = ?',
                [req.body.company_id, req.body.invoice_number], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });

        if (existingInvoice) {
            return res.status(400).json({ error: `El número de factura ${req.body.invoice_number} ya existe para esta empresa.` });
        }

        // Check status (default to draft if not specified, unless explicit finalize action)
        const status = req.body.status || 'draft';
        const isFinal = status === 'final';

        // Get next sequence number ONLY if finalizing
        let invoiceSequence = null;
        let invoiceNumber = req.body.invoice_number;

        if (isFinal) {
            invoiceSequence = await verifactu.getNextInvoiceSequence(db, req.body.company_id);
            // Redetermine invoice number based on sequence to ensure correlation
            invoiceNumber = verifactu.formatInvoiceNumber(invoiceSequence, company.verifactu_enabled);
        }

        // Get previous hash for chaining (if Veri*Factu enabled AND finalizing)
        let previousHash = null;
        if (company.verifactu_enabled && isFinal) {
            previousHash = await verifactu.getPreviousInvoiceHash(db, req.body.company_id);
        }

        var invoiceData = {
            company_id: req.body.company_id,
            client_id: req.body.client_id || null,
            invoice_number: invoiceNumber,
            invoice_sequence: invoiceSequence,
            date: req.body.date,
            client_name: req.body.client_name,
            client_cif: req.body.client_cif,
            client_address: req.body.client_address || '',
            client_type: req.body.client_type || 'empresa',
            notes: req.body.notes || '',
            subtotal: req.body.subtotal || 0,
            total_vat: req.body.total_vat || 0,
            total: req.body.total || 0,
            previous_hash: previousHash,
            status: status,
            finalized_at: isFinal ? new Date().toISOString() : null
        };

        // Generate hash and signature if Veri*Factu enabled AND finalizing
        let currentHash = null;
        let verifactuSignature = null;
        let qrCode = null;

        if (company.verifactu_enabled && isFinal) {
            currentHash = verifactu.generateInvoiceHash(invoiceData);
            verifactuSignature = verifactu.generateVerifactuSignature(currentHash, company);

            // Generate QR code
            const qrInvoiceData = {
                ...invoiceData,
                current_hash: currentHash
            };
            qrCode = await verifactu.generateInvoiceQR(qrInvoiceData, company);
        }

        // Insert invoice
        const invoiceSql = `INSERT INTO invoices 
            (company_id, client_id, invoice_number, invoice_sequence, date, client_name, client_cif, client_address, 
             client_type, notes, subtotal, total_vat, total, previous_hash, current_hash, qr_code, verifactu_signature, status, finalized_at) 
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const invoiceParams = [
            invoiceData.company_id, invoiceData.client_id, invoiceData.invoice_number, invoiceData.invoice_sequence,
            invoiceData.date, invoiceData.client_name, invoiceData.client_cif, invoiceData.client_address,
            invoiceData.client_type, invoiceData.notes, invoiceData.subtotal, invoiceData.total_vat,
            invoiceData.total, previousHash, currentHash, qrCode, verifactuSignature, invoiceData.status, invoiceData.finalized_at
        ];

        const invoiceId = await new Promise((resolve, reject) => {
            db.run(invoiceSql, invoiceParams, function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Update company's last sequence number ONLY if finalizing
        if (isFinal && invoiceSequence) {
            await verifactu.updateCompanySequence(db, req.body.company_id, invoiceSequence);
        }

        // Insert invoice items
        const items = req.body.items;
        const itemSql = `INSERT INTO invoice_items 
            (invoice_id, article_id, description, quantity, unit_price, vat_rate, line_total, line_vat, line_total_with_vat, sort_order) 
            VALUES (?,?,?,?,?,?,?,?,?,?)`;

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const itemParams = [
                invoiceId,
                item.article_id || null,
                item.description,
                item.quantity || 1,
                item.unit_price || 0,
                item.vat_rate || 0,
                item.line_total || 0,
                item.line_vat || 0,
                item.line_total_with_vat || 0,
                index
            ];

            console.log('DEBUG Item Params:', itemParams);

            await new Promise((resolve, reject) => {
                db.run(itemSql, itemParams, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Log audit entry
        await verifactu.logAuditEntry(db, invoiceId, 'CREATE', {
            user_info: 'system',
            new_state: invoiceData,
            ip_address: req.ip
        });

        res.json({
            "message": "success",
            "data": {
                ...invoiceData,
                current_hash: currentHash,
                verifactu_enabled: company.verifactu_enabled
            },
            "id": invoiceId
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ "error": error.message });
    }
});

// List all invoices with optional company filter
app.get('/api/invoices', requireAuth, (req, res) => {
    let sql = `SELECT invoices.*, companies.company_name 
               FROM invoices 
               LEFT JOIN companies ON invoices.company_id = companies.id
               WHERE invoices.is_deleted = 0`;
    const params = [];

    // Company filter
    if (req.query.company_id) {
        sql += ` AND invoices.company_id = ?`;
        params.push(req.query.company_id);
    }

    // Date range filter
    if (req.query.date_from) {
        sql += ` AND invoices.date >= ?`;
        params.push(req.query.date_from);
    }
    if (req.query.date_to) {
        sql += ` AND invoices.date <= ?`;
        params.push(req.query.date_to);
    }

    // Client filter
    if (req.query.client) {
        sql += ` AND invoices.client_name LIKE ?`;
        params.push(`%${req.query.client}%`);
    }

    // Invoice number filter
    if (req.query.invoice_number) {
        sql += ` AND invoices.invoice_number LIKE ?`;
        params.push(`%${req.query.invoice_number}%`);
    }

    // Client type filter
    if (req.query.client_type) {
        sql += ` AND invoices.client_type = ?`;
        params.push(req.query.client_type);
    }

    // Veri*Factu filter
    if (req.query.verifactu === 'yes') {
        sql += ` AND invoices.current_hash IS NOT NULL`;
    } else if (req.query.verifactu === 'no') {
        sql += ` AND invoices.current_hash IS NULL`;
    }

    // Status filter
    if (req.query.status === 'active') {
        sql += ` AND (invoices.is_cancelled = 0 OR invoices.is_cancelled IS NULL)`;
    } else if (req.query.status === 'cancelled') {
        sql += ` AND invoices.is_cancelled = 1`;
    }

    sql += ` ORDER BY invoices.id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        })
    });
});

// Get a single invoice with its items
app.get('/api/invoices/:id', requireAuth, (req, res) => {
    const invoiceSql = `SELECT invoices.*, companies.* 
                        FROM invoices 
                        LEFT JOIN companies ON invoices.company_id = companies.id 
                        WHERE invoices.id = ?`;

    db.get(invoiceSql, [req.params.id], (err, invoice) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (!invoice) {
            res.status(404).json({ "error": "Invoice not found" });
            return;
        }

        const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order`;

        db.all(itemsSql, [req.params.id], (err, items) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }

            res.json({
                "message": "success",
                "data": {
                    invoice: invoice,
                    items: items
                }
            });
        });
    });
});

// Verify invoice integrity (Veri*Factu)
app.get('/api/invoices/:id/verify', async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // Get invoice with company data
        const invoice = await new Promise((resolve, reject) => {
            db.get(
                `SELECT invoices.*, companies.verifactu_enabled 
                 FROM invoices 
                 LEFT JOIN companies ON invoices.company_id = companies.id 
                 WHERE invoices.id = ?`,
                [invoiceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!invoice) {
            res.status(404).json({ "error": "Invoice not found" });
            return;
        }

        if (!invoice.verifactu_enabled) {
            res.json({
                "message": "Veri*Factu not enabled for this company",
                "verified": false
            });
            return;
        }

        // Recalculate hash and verify
        const recalculatedHash = verifactu.generateInvoiceHash(invoice);
        const hashMatches = recalculatedHash === invoice.current_hash;

        res.json({
            "message": "success",
            "verified": hashMatches,
            "invoice_number": invoice.invoice_number,
            "sequence": invoice.invoice_sequence,
            "hash": invoice.current_hash,
            "recalculated_hash": recalculatedHash
        });

    } catch (error) {
        console.error('Error verifying invoice:', error);
        res.status(500).json({ "error": error.message });
    }
});

// Get chain status for a company
app.get('/api/companies/:id/chain-status', async (req, res) => {
    try {
        const companyId = req.params.id;

        // Get all invoices for this company in sequence order
        const invoices = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM invoices 
                 WHERE company_id = ? AND is_cancelled = 0 
                 ORDER BY invoice_sequence ASC`,
                [companyId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const validation = verifactu.validateInvoiceChain(invoices);

        res.json({
            "message": "success",
            "total_invoices": invoices.length,
            "chain_valid": validation.valid,
            "validation_message": validation.message,
            "last_sequence": invoices.length > 0 ? invoices[invoices.length - 1].invoice_sequence : 0
        });

    } catch (error) {
        console.error('Error checking chain status:', error);
        res.status(500).json({ "error": error.message });
    }
});

// Cancel an invoice (Veri*Factu compliant - no deletion)
app.post('/api/invoices/:id/cancel', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const reason = req.body.reason || 'Cancelled by user';

        // Get invoice
        const invoice = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!invoice) {
            res.status(404).json({ "error": "Invoice not found" });
            return;
        }

        if (invoice.is_cancelled) {
            res.status(400).json({ "error": "Invoice already cancelled" });
            return;
        }

        // Mark as cancelled
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE invoices 
                 SET is_cancelled = 1, cancellation_date = ?, cancellation_reason = ? 
                 WHERE id = ?`,
                [new Date().toISOString(), reason, invoiceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Log audit entry
        await verifactu.logAuditEntry(db, invoiceId, 'CANCEL', {
            user_info: 'system',
            previous_state: { is_cancelled: 0 },
            new_state: { is_cancelled: 1, reason: reason },
            ip_address: req.ip
        });

        res.json({
            "message": "Invoice cancelled successfully",
            "invoice_id": invoiceId
        });

    } catch (error) {
        console.error('Error cancelling invoice:', error);
        res.status(500).json({ "error": error.message });
    }
});

// Delete (Hide) an invoice - logical delete
app.delete('/api/invoices/:id', requireAuth, async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // Get invoice to check status
        const invoice = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Logical delete
        await new Promise((resolve, reject) => {
            db.run('UPDATE invoices SET is_deleted = 1 WHERE id = ?', [invoiceId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Log audit
        await verifactu.logAuditEntry(db, invoiceId, 'HIDE', {
            user_info: req.session.user?.username || 'system',
            previous_state: { is_deleted: 0 },
            new_state: { is_deleted: 1 },
            ip_address: req.ip
        });

        res.json({ message: "Invoice hidden successfully" });

    } catch (error) {
        console.error('Error hiding invoice:', error);
        res.status(500).json({ error: error.message });
    }
});


// Update an invoice (only if draft)
app.put('/api/invoices/:id', requireAuth, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        // Check if invoice exists and is draft
        const invoice = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        if (invoice.status === 'final') {
            return res.status(403).json({ error: 'No se puede editar una factura finalizada' });
        }

        // Update fields with defaults to prevent database errors
        const {
            date,
            client_name,
            client_cif,
            client_address = '',
            client_type = 'particular',
            notes = '',
            subtotal = 0,
            total_vat = 0,
            total = 0,
            items,
            client_id = null,
            company_id,
            invoice_number
        } = req.body;

        if (!company_id) {
            return res.status(400).json({ error: 'La empresa emisora es requerida' });
        }

        if (!client_name || !client_name.trim()) {
            return res.status(400).json({ error: 'El nombre del cliente es requerido' });
        }
        if (!client_cif || !client_cif.trim()) {
            return res.status(400).json({ error: 'El NIF/CIF del cliente es requerido' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Se requiere al menos una línea de factura' });
        }

        // Validate items
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.description || !item.description.trim()) {
                return res.status(400).json({ error: `Línea ${i + 1}: La descripción es requerida` });
            }
            if (!item.unit_price || item.unit_price <= 0) {
                return res.status(400).json({ error: `Línea ${i + 1}: El precio unitario debe ser mayor a 0` });
            }
            if (!item.quantity || item.quantity <= 0) {
                return res.status(400).json({ error: `Línea ${i + 1}: La cantidad debe ser mayor a 0` });
            }
        }

        const updateSql = `UPDATE invoices SET 
            date = ?, client_name = ?, client_cif = ?, client_address = ?, client_type = ?, 
            notes = ?, subtotal = ?, total_vat = ?, total = ?, client_id = ?, company_id = ?, invoice_number = ?, status = ?
            WHERE id = ?`;

        const updateParams = [
            date,
            client_name,
            client_cif,
            client_address,
            client_type,
            notes,
            subtotal,
            total_vat,
            total,
            client_id,
            company_id,
            invoice_number,
            req.body.status || invoice.status,
            invoiceId
        ];

        await new Promise((resolve, reject) => {
            db.run(updateSql, updateParams, function (err) {
                if (err) reject(new Error('Error al actualizar base: ' + err.message));
                else resolve();
            });
        });

        // Update items (delete all and recreate)
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId], (err) => {
                if (err) reject(new Error('Error al limpiar ítems: ' + err.message));
                else resolve();
            });
        });

        const itemSql = `INSERT INTO invoice_items 
            (invoice_id, article_id, description, quantity, unit_price, vat_rate, line_total, line_vat, line_total_with_vat, sort_order) 
            VALUES (?,?,?,?,?,?,?,?,?,?)`;

        if (items && Array.isArray(items)) {
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                const itemParams = [
                    invoiceId,
                    item.article_id || null,
                    item.description,
                    item.quantity || 1,
                    item.unit_price || 0,
                    item.vat_rate || 0,
                    item.line_total || 0,
                    item.line_vat || 0,
                    item.line_total_with_vat || 0,
                    index
                ];
                await new Promise((resolve, reject) => {
                    db.run(itemSql, itemParams, (err) => {
                        if (err) reject(new Error(`Error al insertar ítem ${index}: ` + err.message));
                        else resolve();
                    });
                });
            }
        }

        res.json({ message: 'Factura actualizada correctamente' });

    } catch (error) {
        console.error('Error updating invoice:', {
            id: invoiceId,
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ error: error.message });
    }
});

// Finalize an invoice (Lock and Generate Veri*Factu data)
app.post('/api/invoices/:id/finalize', requireAuth, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        // Get invoice and company data
        const invoice = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
        if (invoice.status === 'final') return res.status(400).json({ error: 'La factura ya está finalizada' });
        if (!invoice.company_id) return res.status(400).json({ error: 'La factura no tiene una empresa asociada' });

        const company = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM companies WHERE id = ?', [invoice.company_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Logic similar to CREATE but only for finalization components
        const invoiceSequence = await verifactu.getNextInvoiceSequence(db, invoice.company_id);
        const finalInvoiceNumber = verifactu.formatInvoiceNumber(invoiceSequence, company.verifactu_enabled);

        // Check if the NEW finalized number already exists (unlikely but safe)
        const existingFinal = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM invoices WHERE company_id = ? AND invoice_number = ? AND id != ?',
                [invoice.company_id, finalInvoiceNumber, invoiceId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });

        if (existingFinal) {
            return res.status(400).json({ error: `El número de factura final ${finalInvoiceNumber} ya existe.` });
        }

        let previousHash = null;
        if (company.verifactu_enabled) {
            previousHash = await verifactu.getPreviousInvoiceHash(db, invoice.company_id);
        }

        // Prepare data for hashing (need to reconstruct full object)
        const invoiceData = {
            company_id: invoice.company_id,
            invoice_number: finalInvoiceNumber,
            invoice_sequence: invoiceSequence,
            date: invoice.date,
            subtotal: invoice.subtotal,
            total_vat: invoice.total_vat,
            total: invoice.total,
            client_name: invoice.client_name,
            client_cif: invoice.client_cif,
            client_address: invoice.client_address,
            client_type: invoice.client_type,
            notes: invoice.notes,
            previous_hash: previousHash
        };

        let currentHash = null;
        let verifactuSignature = null;
        let qrCode = null;

        if (company.verifactu_enabled) {
            currentHash = verifactu.generateInvoiceHash(invoiceData);
            verifactuSignature = verifactu.generateVerifactuSignature(currentHash, company);

            const qrInvoiceData = { ...invoiceData, current_hash: currentHash };
            qrCode = await verifactu.generateInvoiceQR(qrInvoiceData, company);
        }

        // Update invoice with final data
        const updateSql = `UPDATE invoices SET 
            status = 'final', finalized_at = ?, invoice_sequence = ?, 
            previous_hash = ?, current_hash = ?, qr_code = ?, verifactu_signature = ?,
            invoice_number = ?
            WHERE id = ?`;

        const finalizedAt = new Date().toISOString();
        const params = [finalizedAt, invoiceSequence, previousHash, currentHash, qrCode, verifactuSignature, finalInvoiceNumber, invoiceId];

        await new Promise((resolve, reject) => {
            db.run(updateSql, params, function (err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Update company sequence
        await verifactu.updateCompanySequence(db, invoice.company_id, invoiceSequence);

        res.json({ message: 'Factura finalizada correctamente', qr_code: qrCode });

    } catch (error) {
        console.error('Error finalizing invoice:', error);
        res.status(500).json({ error: error.message });
    }
});

// PDF Generation Endpoint
app.get('/api/invoices/:id/pdf', async (req, res) => {
    const invoiceId = req.params.id;

    try {
        // Get invoice data with company info
        const sql = `SELECT 
                        invoices.id as invoice_id,
                        invoices.invoice_number,
                        invoices.invoice_sequence,
                        invoices.date,
                        invoices.client_name,
                        invoices.client_cif,
                        invoices.client_address,
                        invoices.client_type,
                        invoices.notes,
                        invoices.subtotal,
                        invoices.total_vat,
                        invoices.total,
                        invoices.qr_code,
                        invoices.current_hash,
                        invoices.is_cancelled,
                        invoices.status as invoice_status,
                        companies.company_name,
                        companies.cif as company_cif,
                        companies.address as company_address,
                        companies.phone as company_phone,
                        companies.email as company_email,
                        companies.bank_iban,
                        companies.verifactu_enabled,
                        companies.logo as company_logo
                     FROM invoices 
                     LEFT JOIN companies ON invoices.company_id = companies.id 
                     WHERE invoices.id = ?`;

        db.get(sql, [invoiceId], async (err, row) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }

            if (!row) {
                res.status(404).json({ "error": "Invoice not found" });
                return;
            }

            // Get invoice items
            const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order`;

            db.all(itemsSql, [invoiceId], async (err, items) => {
                if (err) {
                    res.status(400).json({ "error": err.message });
                    return;
                }

                // Prepare invoice and company data
                const invoiceData = {
                    id: row.invoice_id,
                    invoice_number: row.invoice_number,
                    invoice_sequence: row.invoice_sequence,
                    date: row.date,
                    client_name: row.client_name,
                    client_cif: row.client_cif,
                    client_address: row.client_address,
                    client_type: row.client_type,
                    notes: row.notes,
                    subtotal: row.subtotal,
                    total_vat: row.total_vat,
                    total: row.total,
                    items: items,
                    qr_code: row.qr_code,
                    current_hash: row.current_hash,
                    is_cancelled: row.is_cancelled,
                    status: row.invoice_status
                };

                const companyData = {
                    company_name: row.company_name,
                    cif: row.company_cif,
                    address: row.company_address,
                    phone: row.company_phone,
                    email: row.company_email,
                    bank_iban: row.bank_iban,
                    verifactu_enabled: row.verifactu_enabled,
                    logo: row.company_logo
                };

                try {
                    // Try to generate PDF
                    let pdfBuffer;
                    let isHtmlFallback = false;

                    try {
                        pdfBuffer = await generateInvoicePDF(invoiceData, companyData);
                    } catch (pdfError) {
                        console.error('Puppeteer PDF failed, falling back to HTML:', pdfError.message);
                        const { renderInvoiceHTML } = require('./pdfGenerator.js');
                        const html = await renderInvoiceHTML(invoiceData, companyData);
                        pdfBuffer = Buffer.from(html);
                        isHtmlFallback = true;
                    }

                    // Set headers
                    if (isHtmlFallback) {
                        res.setHeader('Content-Type', 'text/html');
                        // No disposition for HTML fallback, show inline
                    } else {
                        const filename = `Factura_${invoiceData.invoice_number}.pdf`;
                        const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
                        res.setHeader('Content-Length', pdfBuffer.length);
                    }

                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-src 'self';");

                    res.send(pdfBuffer);

                } catch (generalError) {
                    console.error('Final PDF/HTML endpoint error:', generalError);
                    res.status(500).json({ "error": "Error generating invoice: " + generalError.message });
                }
            });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ "error": error.message });
    }
});

// ============================================
// REPORTS ENDPOINTS
// ============================================

// Helper to build filter query
function buildInvoiceFilterQuery(req) {
    let sql = `SELECT invoices.*, companies.company_name as company_name 
               FROM invoices 
               LEFT JOIN companies ON invoices.company_id = companies.id 
               WHERE 1=1`;
    const params = [];

    if (req.query.company_id) {
        sql += ` AND invoices.company_id = ?`;
        params.push(req.query.company_id);
    }

    if (req.query.date_from) {
        sql += ` AND invoices.date >= ?`;
        params.push(req.query.date_from);
    }

    if (req.query.date_to) {
        sql += ` AND invoices.date <= ?`;
        params.push(req.query.date_to);
    }

    if (req.query.client) {
        sql += ` AND invoices.client_name LIKE ?`;
        params.push(`%${req.query.client}%`);
    }

    if (req.query.invoice_number) {
        sql += ` AND invoices.invoice_number LIKE ?`;
        params.push(`%${req.query.invoice_number}%`);
    }

    if (req.query.client_type) {
        sql += ` AND invoices.client_type = ?`;
        params.push(req.query.client_type);
    }

    if (req.query.verifactu === 'yes') {
        sql += ` AND invoices.current_hash IS NOT NULL`;
    } else if (req.query.verifactu === 'no') {
        sql += ` AND invoices.current_hash IS NULL`;
    }

    if (req.query.status === 'active') {
        sql += ` AND invoices.is_cancelled = 0 AND invoices.status = 'final'`;
    } else if (req.query.status === 'cancelled') {
        sql += ` AND invoices.is_cancelled = 1`;
    } else if (req.query.status === 'draft') {
        sql += ` AND invoices.status = 'draft'`;
    }

    sql += ` ORDER BY invoices.date DESC, invoices.created_at DESC`;

    return { sql, params };
}

// Export Invoices to CSV
app.get('/api/reports/invoices/export', requireAuth, (req, res) => {
    const { sql, params } = buildInvoiceFilterQuery(req);

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).send("Error generating report");

        // Generate CSV
        const header = ["Empresa", "Nº Factura", "Fecha", "Cliente", "CIF Cliente", "Tipo", "Base Imponible", "IVA", "Total", "Estado", "Veri*Factu"];
        const csvRows = [header.join(";")]; // Use semicolon for Excel compatibility in EU

        rows.forEach(row => {
            let status = row.is_cancelled ? 'Anulada' : (row.status === 'final' ? 'Finalizada' : 'Borrador');
            let verifactu = row.current_hash ? 'Sí' : 'No';

            const data = [
                `"${row.company_name || ''}"`,
                `"${row.invoice_number}"`,
                row.date,
                `"${row.client_name}"`,
                `"${row.client_cif}"`,
                row.client_type,
                (row.subtotal || 0).toFixed(2).replace('.', ','),
                (row.total_vat || 0).toFixed(2).replace('.', ','),
                (row.total || 0).toFixed(2).replace('.', ','),
                status,
                verifactu
            ];
            csvRows.push(data.join(";"));
        });

        const csvString = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel UTF-8

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="listado_facturas.csv"');
        res.send(csvString);
    });
});

// Print Invoice List
app.get('/api/reports/invoices/print', requireAuth, (req, res) => {
    const { sql, params } = buildInvoiceFilterQuery(req);

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Error generating print view:', err);
            return res.status(500).send("Error generating report");
        }

        let totalSum = 0;
        let vatSum = 0;
        let baseSum = 0;

        const tableRows = rows.map(row => {
            try {
                if (!row.is_cancelled) {
                    totalSum += (Number(row.total) || 0);
                    vatSum += (Number(row.total_vat) || 0);
                    baseSum += (Number(row.subtotal) || 0);
                }

                let statusBadge = row.is_cancelled ? '<span style="color:red">[ANULADA]</span>' : (row.status === 'draft' ? '<span style="color:gray">[BORRADOR]</span>' : '');

                return `
                    <tr>
                        <td>${row.date || ''}</td>
                        <td>${row.invoice_number || ''} ${statusBadge}</td>
                        <td>${row.client_name || ''}</td>
                        <td>${row.client_cif || ''}</td>
                        <td style="text-align:right">${(Number(row.subtotal) || 0).toFixed(2)} €</td>
                        <td style="text-align:right">${(Number(row.total_vat) || 0).toFixed(2)} €</td>
                        <td style="text-align:right">${(Number(row.total) || 0).toFixed(2)} €</td>
                    </tr>
                `;
            } catch (err) {
                console.error('Error generating row:', err, row);
                return `<tr><td colspan="7">Error en fila: ${err.message}</td></tr>`;
            }
        }).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Listado de Facturas</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                    th { background-color: #f2f2f2; }
                    h1 { margin-bottom: 5px; }
                    .filters { margin-bottom: 20px; color: #666; font-size: 14px; }
                    .totals { margin-top: 20px; text-align: right; font-weight: bold; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom:20px">
                    <button onclick="window.print()">🖨️ Imprimir</button>
                    <button onclick="window.close()">Cerrar</button>
                </div>
                <h1>Listado de Facturas</h1>
                <div class="filters">Generado el: ${new Date().toLocaleString()}</div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Nº Factura</th>
                            <th>Cliente</th>
                            <th>NIF/CIF</th>
                            <th style="text-align:right">Base Imponible</th>
                            <th style="text-align:right">IVA</th>
                            <th style="text-align:right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                <div class="totals">
                    <p>Total Base: ${baseSum.toFixed(2)} €</p>
                    <p>Total IVA: ${vatSum.toFixed(2)} €</p>
                    <p>TOTAL: ${totalSum.toFixed(2)} €</p>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    });
});

// ============================================
// BACKUP MANAGEMENT ENDPOINTS (Admin only)
// ============================================

// Create backup
app.post('/api/backups/create', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        // 1. Verify DB Integrity
        const isDbIntact = await backupManager.verifyDbIntegrity(db);
        if (!isDbIntact) {
            console.warn('⚠️ Database integrity issues detected before backup');
        }

        // 2. Get Veri*Factu Audit Trail
        const auditTrail = await verifactu.getAuditTrail(db);

        // 3. Create Backup with Audit
        const backup = await backupManager.createBackup(auditTrail);

        res.json({
            message: 'Backup creado exitosamente' + (isDbIntact ? '' : ' (con advertencias de integridad)'),
            backup
        });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Error al crear backup: ' + error.message });
    }
});

// List backups
app.get('/api/backups', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const backups = await backupManager.listBackups();
        res.json({ backups });
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Error al listar backups: ' + error.message });
    }
});

// Download backup
app.get('/api/backups/:name/download', requireAuth, requireRole('admin'), (req, res) => {
    try {
        const backupPath = path.join('./backups', req.params.name);

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup no encontrado' });
        }

        res.download(backupPath, req.params.name);
    } catch (error) {
        console.error('Error downloading backup:', error);
        res.status(500).json({ error: 'Error al descargar backup: ' + error.message });
    }
});

// Restore backup
app.post('/api/backups/restore', requireAuth, requireRole('admin'), backupUpload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha proporcionado archivo de backup' });
        }

        const result = await backupManager.restoreBackup(req.file.path);

        // Delete uploaded file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({
            message: 'Backup restaurado exitosamente. El sistema se reiniciará en un momento.',
            safetyBackup: result.safetyBackup
        });

        // RESTART SERVER to reload the database
        console.log('🔄 DEPURACIÓN: Reiniciando servidor tras restauración de backup...');
        setTimeout(() => {
            process.exit(0); // Coolify/Docker will auto-restart
        }, 2000);
    } catch (error) {
        console.error('Error restoring backup:', error);

        // Clean up uploaded file if exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ error: 'Error al restaurar backup: ' + error.message });
    }
});

// Delete backup
app.delete('/api/backups/:name', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        await backupManager.deleteBackup(req.params.name);
        res.json({ message: 'Backup eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleting backup:', error);
        res.status(500).json({ error: 'Error al eliminar backup: ' + error.message });
    }
});

// ============================================
// VERI*FACTU COMPLIANCE ENDPOINTS
// ============================================

// Verify invoice chain integrity
app.get('/api/verifactu/verify-chain/:companyId', requireAuth, async (req, res) => {
    try {
        const companyId = req.params.companyId;
        const result = await verifactu.verifyInvoiceChain(db, companyId);
        res.json(result);
    } catch (error) {
        console.error('Error verifying Veri*Factu chain:', error);
        res.status(500).json({ error: 'Error al verificar cadena: ' + error.message });
    }
});

// Download Audit Trail (Admin only)
app.get('/api/verifactu/audit-trail', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const auditTrail = await verifactu.getAuditTrail(db);
        res.json(auditTrail);
    } catch (error) {
        console.error('Error fetching audit trail:', error);
        res.status(500).json({ error: 'Error al obtener registro de auditoría' });
    }
});

// Database upload endpoint (for migrating local DB to production)
app.post('/api/admin/upload-database', dbUpload.single('database'), async (req, res) => {
    try {
        // Verify secret key
        const uploadSecret = process.env.UPLOAD_SECRET || 'change-this-secret-key';
        if (req.body.secret !== uploadSecret) {
            return res.status(403).json({ error: 'Invalid secret key' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No database file provided' });
        }

        const uploadedDbPath = req.file.path;
        const targetDbPath = path.join(__dirname, 'invoices.db');
        const backupDbPath = path.join(__dirname, 'invoices.db.backup.' + Date.now());

        // Backup current database
        if (fs.existsSync(targetDbPath)) {
            fs.copyFileSync(targetDbPath, backupDbPath);
            console.log('📦 Current database backed up to:', backupDbPath);
        }

        // Replace with uploaded database
        fs.copyFileSync(uploadedDbPath, targetDbPath);
        fs.unlinkSync(uploadedDbPath);

        console.log('✅ Database replaced successfully');

        res.json({
            message: 'Database uploaded and replaced successfully',
            backup: backupDbPath
        });

        // Restart server to reload database
        console.log('🔄 Restarting server to apply new database...');
        setTimeout(() => {
            process.exit(0); // Coolify will auto-restart
        }, 1000);

    } catch (error) {
        console.error('Error uploading database:', error);
        res.status(500).json({ error: 'Error uploading database: ' + error.message });
    }
});

// Start server
app.listen(HTTP_PORT, async () => {
    console.log(`Server running on port ${HTTP_PORT}`);

    // Wait for database to be fully initialized
    setTimeout(async () => {
        // --- SAFE PURGE MECHANISM ---
        if (process.env.PURGE_DATABASE === 'true') {
            console.log('⚠️ [DANGER] PURGE_DATABASE=true detected. Preparing security backup before wipe...');

            try {
                // Create emergency backup before purge
                const emergencyBackup = await backupManager.createBackup([{
                    action: 'EMERGENCY_PRE_PURGE_BACKUP',
                    timestamp: new Date().toISOString()
                }]);
                console.log(`✅ [Safety] Emergency backup created: ${emergencyBackup.name}`);

                console.log('⚠️ [DANGER] Wiping all transaction data...');
                const tablesToPurge = ['invoices', 'invoice_items', 'articles', 'clients', 'companies', 'invoice_audit_log'];

                await new Promise((resolve) => {
                    db.serialize(() => {
                        tablesToPurge.forEach(table => {
                            db.run(`DELETE FROM ${table}`, (err) => {
                                if (err) console.error(`[Purge] Error cleaning ${table}:`, err.message);
                                else console.log(`[Purge] Table ${table} cleaned.`);
                            });
                        });
                        // Reset sequences
                        db.run("DELETE FROM sqlite_sequence", () => {
                            console.log('[Purge] Reset auto-increment sequences.');
                            resolve();
                        });
                    });
                });
                console.log('✅ [Purge] Database wipe complete.');
            } catch (backupErr) {
                console.error('❌ [Safety] COULD NOT CREATE EMERGENCY BACKUP. ABORTING PURGE for data safety.', backupErr);
            }
        }

        await initializeUsers();

        // --- AUTOMATIC SCHEDULED BACKUPS ---
        // Schedule daily backup at 00:00
        cron.schedule('0 0 * * *', async () => {
            console.log('⏰ [Cron] Running scheduled daily backup...');
            try {
                const backup = await backupManager.createBackup([{ action: 'SCHEDULED_DAILY_BACKUP' }]);
                await backupManager.cleanOldBackups(30); // Keep last 30 backups
                console.log(`✅ [Cron] Daily backup completed: ${backup.name}`);
            } catch (err) {
                console.error('❌ [Cron] Error during scheduled backup:', err);
            }
        });
        console.log('📅 [Cron] Daily backups scheduled for 00:00.');

        // Initialize demo data if enabled (and not purging)
        if (process.env.INIT_DEMO_DATA === 'true' && process.env.PURGE_DATABASE !== 'true') {
            const { initializeDemoData } = require('./init-demo.js');
            setTimeout(() => {
                initializeDemoData();
            }, 1000);
        }
    }, 1000);
});

// Initialize admin and root users
async function initializeUsers() {
    try {
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        if (!adminExists) {
            console.log('⚠️  Admin user not found. Creating default admin user...');
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
        } else {
            console.log('✅ Admin user exists');
        }
    } catch (error) {
        console.error('❌ Error checking/creating admin user:', error);
    }

    // Ensure ROOT user exists (CRITICAL for recovery)
    try {
        const rootExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['root'], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        if (!rootExists) {
            console.log('⚠️  Root user not found. Creating root user...');

            // Generate secure random password
            const rootPassword = crypto.randomBytes(16).toString('hex');
            const passwordHash = await hashPassword(rootPassword);
            const rootEmail = process.env.ROOT_EMAIL || 'root@facturas.local';

            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO users (username, password_hash, full_name, email, role, is_active, is_root, must_change_password) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['root', passwordHash, 'Root Administrator', rootEmail, 'admin', 1, 1, 1],
                    function (err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            console.log('✅ Root user created successfully!');
            console.log('   Username: root');
            console.log('   Email: ' + rootEmail);
            console.log('   Password: ' + rootPassword);
            console.log('   ⚠️  SAVE THIS PASSWORD! It will not be shown again.');

            // Try to send email with credentials
            if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                try {
                    await emailService.sendRootCredentialsEmail(rootEmail, rootPassword);
                    console.log('   ✅ Root credentials sent to email');
                } catch (emailError) {
                    console.log('   ⚠️  Could not send email. Save the password shown above!');
                }
            } else {
                console.log('   ⚠️  Email not configured. Save the password shown above!');
            }
        } else {
            console.log('✅ Root user exists');
        }
    } catch (error) {
        console.error('❌ Error checking/creating root user:', error);
    }
}


