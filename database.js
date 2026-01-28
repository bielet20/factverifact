const sqlite3 = require('sqlite3').verbose();

const DBSOURCE = "invoices.db";

let db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');

        // Create companies table
        db.run(`CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            cif TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            email TEXT,
            bank_iban TEXT,
            verifactu_enabled INTEGER DEFAULT 0,
            verifactu_software_id TEXT,
            verifactu_software_name TEXT DEFAULT 'Sistema Facturas v1.0',
            last_invoice_sequence INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating companies table:', err);
                } else {
                    console.log('Companies table ready.');
                }
            });

        // Create articles/services table
        db.run(`CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            unit_price REAL NOT NULL,
            vat_rate REAL NOT NULL DEFAULT 21,
            category TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating articles table:', err);
                } else {
                    console.log('Articles table ready.');
                }
            });

        // Create invoices table
        db.run(`CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            invoice_number TEXT,
            invoice_sequence INTEGER,
            date TEXT,
            client_name TEXT,
            client_cif TEXT,
            client_address TEXT,
            client_type TEXT DEFAULT 'empresa',
            notes TEXT,
            subtotal REAL DEFAULT 0,
            total_vat REAL DEFAULT 0,
            total REAL DEFAULT 0,
            previous_hash TEXT,
            current_hash TEXT,
            qr_code TEXT,
            is_cancelled INTEGER DEFAULT 0,
            cancellation_date TEXT,
            cancellation_reason TEXT,
            verifactu_signature TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies (id)
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating invoices table:', err);
                } else {
                    console.log('Invoices table ready.');
                }
            });

        // Create invoice items table
        db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            article_id INTEGER,
            description TEXT NOT NULL,
            quantity REAL NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL,
            vat_rate REAL NOT NULL,
            line_total REAL NOT NULL,
            line_vat REAL NOT NULL,
            line_total_with_vat REAL NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
            FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE SET NULL
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating invoice_items table:', err);
                } else {
                    console.log('Invoice items table ready.');
                }
            });

        // Create audit log table for Veri*Factu compliance
        db.run(`CREATE TABLE IF NOT EXISTS invoice_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            user_info TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            previous_state TEXT,
            new_state TEXT,
            ip_address TEXT,
            FOREIGN KEY (invoice_id) REFERENCES invoices (id)
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating audit log table:', err);
                } else {
                    console.log('Audit log table ready.');
                }
            });

        // Create users table for authentication
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'viewer')) DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            is_root INTEGER DEFAULT 0,
            must_change_password INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )`,
            (err) => {
                if (err) {
                    console.error('Error creating users table:', err);
                } else {
                    console.log('Users table ready.');
                }
            });
    }
});

module.exports = db;

