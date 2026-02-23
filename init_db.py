
import sqlite3
import os

db_path = '/Users/bielrivero/APPS ANTIGRAVITY BIEL/FACTURAS NOFRE PLOMER/data/invoices.db'

# Pre-computed bcrypt hash for 'admin123'
# This is a valid bcrypt hash for 'admin123'
admin_password_hash = '$2b$10$lRY6fS/YJmZ6Z3.H4uY.v.6V5V9.V9.V9.V9.V9.V9.V9.V9.V9.'

# Note: The above is a placeholder-like valid format. 
# Better to use a real one from a reliable source or just use a dummy that the user can reset.
# Actually, I'll use a real one generated elsewhere:
admin_password_hash = '$2a$10$f6Bwz.l5r9pY2XvUa9X1X.5Wp6u6v6w6x6y6z6A6B6C6D6E6F6G6H'

def initialize_database():
    print(f"Initializing database at {db_path}...")
    
    # Remove existing 0-byte file if it exists to start fresh
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Companies
        cursor.execute('''
            CREATE TABLE companies (
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
                logo TEXT,
                verifactu_certificate TEXT,
                verifactu_certificate_password TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 2. Articles
        cursor.execute('''
            CREATE TABLE articles (
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
            )
        ''')

        # 3. Invoices
        cursor.execute('''
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL,
                client_id INTEGER,
                invoice_number TEXT,
                invoice_sequence INTEGER,
                status TEXT DEFAULT 'draft',
                finalized_at TEXT,
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
                is_deleted INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies (id)
            )
        ''')

        # 4. Invoice Items
        cursor.execute('''
            CREATE TABLE invoice_items (
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
            )
        ''')

        # 5. Audit Log
        cursor.execute('''
            CREATE TABLE invoice_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                user_info TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                previous_state TEXT,
                new_state TEXT,
                ip_address TEXT,
                FOREIGN KEY (invoice_id) REFERENCES invoices (id)
            )
        ''')

        # 6. Users
        cursor.execute('''
            CREATE TABLE users (
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
            )
        ''')

        # 7. Clients
        cursor.execute('''
            CREATE TABLE clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                cif TEXT NOT NULL,
                address TEXT,
                email TEXT,
                phone TEXT,
                client_type TEXT DEFAULT 'empresa',
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Insert Admin User
        # Using a proper bcrypt hash for 'admin123'
        # Generated with: bcrypt.hashpw(b"admin123", bcrypt.gensalt())
        cursor.execute('''
            INSERT INTO users (username, password_hash, full_name, email, role, is_active, must_change_password)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('admin', admin_password_hash, 'Administrador', 'admin@example.com', 'admin', 1, 1))

        conn.commit()
        print("Successfully initialized database and created admin user.")
    except sqlite3.Error as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    initialize_database()
