const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./invoices.db');

console.log('🔄 Iniciando migración de base de datos para Veri*Factu...\n');

// Función para verificar si una columna existe
function columnExists(tableName, columnName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.some(row => row.name === columnName));
        });
    });
}

// Función para añadir columna si no existe
async function addColumnIfNotExists(tableName, columnName, columnDef) {
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
        return new Promise((resolve, reject) => {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`, (err) => {
                if (err) {
                    console.log(`❌ Error añadiendo ${columnName} a ${tableName}:`, err.message);
                    reject(err);
                } else {
                    console.log(`✅ Columna ${columnName} añadida a ${tableName}`);
                    resolve();
                }
            });
        });
    } else {
        console.log(`ℹ️  Columna ${columnName} ya existe en ${tableName}`);
    }
}

async function migrate() {
    try {
        console.log('📋 Migrando tabla COMPANIES...');
        await addColumnIfNotExists('companies', 'verifactu_enabled', 'INTEGER DEFAULT 0');
        await addColumnIfNotExists('companies', 'verifactu_software_id', 'TEXT');
        await addColumnIfNotExists('companies', 'verifactu_software_name', "TEXT DEFAULT 'Sistema Facturas v1.0'");
        await addColumnIfNotExists('companies', 'last_invoice_sequence', 'INTEGER DEFAULT 0');

        console.log('\n📋 Migrando tabla INVOICES...');
        await addColumnIfNotExists('invoices', 'invoice_sequence', 'INTEGER');
        await addColumnIfNotExists('invoices', 'previous_hash', 'TEXT');
        await addColumnIfNotExists('invoices', 'current_hash', 'TEXT');
        await addColumnIfNotExists('invoices', 'qr_code', 'TEXT');
        await addColumnIfNotExists('invoices', 'is_cancelled', 'INTEGER DEFAULT 0');
        await addColumnIfNotExists('invoices', 'cancellation_date', 'TEXT');
        await addColumnIfNotExists('invoices', 'cancellation_reason', 'TEXT');
        await addColumnIfNotExists('invoices', 'verifactu_signature', 'TEXT');

        console.log('\n✅ ¡Migración completada con éxito!\n');
        console.log('🎉 La base de datos está lista para Veri*Factu');

        db.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error durante la migración:', error);
        db.close();
        process.exit(1);
    }
}

migrate();
