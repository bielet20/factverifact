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

const app = express();
const HTTP_PORT = process.env.PORT || 3000;

// Trust proxy - CRITICAL for production behind reverse proxy (Coolify, nginx, etc)
app.set('trust proxy', 1);

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
        httpOnly: true,
        sameSite: 'lax', // Prevent CSRF while allowing same-site navigation
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// CORS configuration - allow production domain
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

// Add production origin if available
if (process.env.PRODUCTION_URL) {
    allowedOrigins.push(process.env.PRODUCTION_URL);
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // In production, allow any origin from same domain
            if (process.env.NODE_ENV === 'production') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'logos');
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
                return res.status(500).json({ error: 'Error del servidor' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }

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

            res.json({
                message: 'Login exitoso',
                user: req.session.user
            });
        });
    } catch (error) {
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
        db.get('SELECT password_hash FROM users WHERE id = ?', [userId], async (err, user) => {
            if (err || !user) {
                return res.status(500).json({ error: 'Error del servidor' });
            }

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

                    res.json({ message: 'Contraseña cambiada exitosamente' });
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
    const { full_name, email, role, is_active } = req.body;
    const userId = req.params.id;

    if (!full_name || !role) {
        return res.status(400).json({ error: 'Nombre completo y rol son requeridos' });
    }

    if (!['admin', 'user', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    db.run(
        `UPDATE users SET full_name = ?, email = ?, role = ?, is_active = ? WHERE id = ?`,
        [full_name, email || null, role, is_active !== undefined ? is_active : 1, userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            res.json({ message: 'Usuario actualizado exitosamente' });
        }
    );
});

// Delete/deactivate user
app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
    const userId = req.params.id;

    // Don't allow deleting yourself
    if (parseInt(userId) === req.session.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    db.run(
        'UPDATE users SET is_active = 0 WHERE id = ?',
        [userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            res.json({ message: 'Usuario desactivado exitosamente' });
        }
    );
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
        verifactu_software_id: req.body.verifactu_software_id || null
    }
    var sql = 'INSERT INTO companies (company_name, cif, address, phone, email, bank_iban, verifactu_enabled, verifactu_software_id) VALUES (?,?,?,?,?,?,?,?)'
    var params = [data.company_name, data.cif, data.address, data.phone, data.email, data.bank_iban, data.verifactu_enabled, data.verifactu_software_id]
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
    if (!req.body.invoice_number) {
        errors.push("No invoice number specified");
    }
    if (!req.body.company_id) {
        errors.push("Company is required");
    }
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        errors.push("At least one invoice item is required");
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

        // Get next sequence number
        const invoiceSequence = await verifactu.getNextInvoiceSequence(db, req.body.company_id);

        // Get previous hash for chaining (if Veri*Factu enabled)
        let previousHash = null;
        if (company.verifactu_enabled) {
            previousHash = await verifactu.getPreviousInvoiceHash(db, req.body.company_id);
        }

        var invoiceData = {
            company_id: req.body.company_id,
            invoice_number: req.body.invoice_number,
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
            previous_hash: previousHash
        };

        // Generate hash and signature if Veri*Factu enabled
        let currentHash = null;
        let verifactuSignature = null;
        let qrCode = null;

        if (company.verifactu_enabled) {
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
            (company_id, invoice_number, invoice_sequence, date, client_name, client_cif, client_address, 
             client_type, notes, subtotal, total_vat, total, previous_hash, current_hash, qr_code, verifactu_signature) 
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const invoiceParams = [
            invoiceData.company_id, invoiceData.invoice_number, invoiceData.invoice_sequence,
            invoiceData.date, invoiceData.client_name, invoiceData.client_cif, invoiceData.client_address,
            invoiceData.client_type, invoiceData.notes, invoiceData.subtotal, invoiceData.total_vat,
            invoiceData.total, previousHash, currentHash, qrCode, verifactuSignature
        ];

        const invoiceId = await new Promise((resolve, reject) => {
            db.run(invoiceSql, invoiceParams, function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Update company's last sequence number
        await verifactu.updateCompanySequence(db, req.body.company_id, invoiceSequence);

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
                item.quantity,
                item.unit_price,
                item.vat_rate,
                item.line_total,
                item.line_vat,
                item.line_total_with_vat,
                index
            ];

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
               WHERE 1=1`;
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

// PDF Generation Endpoint
app.get('/api/invoices/:id/pdf', async (req, res) => {
    const invoiceId = req.params.id;

    try {
        // Get invoice data with company info
        const sql = `SELECT invoices.*, companies.* 
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
                    id: row.id,
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
                    is_cancelled: row.is_cancelled
                };

                const companyData = {
                    company_name: row.company_name,
                    cif: row.cif,
                    address: row.address,
                    phone: row.phone,
                    email: row.email,
                    bank_iban: row.bank_iban,
                    verifactu_enabled: row.verifactu_enabled,
                    logo: row.logo  // Include logo path
                };

                try {
                    // Generate PDF
                    const pdfBuffer = await generateInvoicePDF(invoiceData, companyData);

                    // Set headers for PDF download with proper filename
                    const filename = `Factura_${invoiceData.invoice_number}.pdf`;
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.setHeader('Content-Length', pdfBuffer.length);
                    res.send(pdfBuffer);

                } catch (pdfError) {
                    console.error('PDF generation error:', pdfError);
                    res.status(500).json({ "error": "Error generating PDF: " + pdfError.message });
                }
            });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ "error": error.message });
    }
});

// ============================================
// BACKUP MANAGEMENT ENDPOINTS (Admin only)
// ============================================

const BackupManager = require('./backup-manager.js');
const backupManager = new BackupManager();

// Create backup
app.post('/api/backups/create', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const backup = await backupManager.createBackup();
        res.json({
            message: 'Backup creado exitosamente',
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
app.post('/api/backups/restore', requireAuth, requireRole('admin'), upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha proporcionado archivo de backup' });
        }

        // Validate file extension
        if (!req.file.originalname.endsWith('.zip')) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'El archivo debe ser un ZIP' });
        }

        const result = await backupManager.restoreBackup(req.file.path);

        // Delete uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            message: 'Backup restaurado exitosamente',
            safetyBackup: result.safetyBackup
        });
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

// Start server
app.listen(HTTP_PORT, async () => {
    console.log(`Server running on port ${HTTP_PORT}`);

    // Ensure admin user exists (CRITICAL for production)
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

    // Initialize demo data if enabled
    if (process.env.INIT_DEMO_DATA === 'true') {
        const { initializeDemoData } = require('./init-demo.js');
        setTimeout(() => {
            initializeDemoData();
        }, 2000);
    }
});

