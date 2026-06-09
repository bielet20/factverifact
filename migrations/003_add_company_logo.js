const db = require('./database.js');

console.log('🔄 Migrando base de datos: Añadiendo campo logo a empresas...');

// Añadir columna logo a la tabla companies
db.run(`ALTER TABLE companies ADD COLUMN logo TEXT`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('✅ La columna logo ya existe en la tabla companies');
        } else {
            console.error('❌ Error añadiendo columna logo:', err.message);
        }
    } else {
        console.log('✅ Columna logo añadida exitosamente a la tabla companies');
    }

    // Verificar la estructura de la tabla
    db.all(`PRAGMA table_info(companies)`, (err, columns) => {
        if (err) {
            console.error('Error verificando estructura:', err);
        } else {
            console.log('\n📋 Estructura actual de la tabla companies:');
            columns.forEach(col => {
                console.log(`  - ${col.name}: ${col.type}`);
            });
        }

        console.log('\n✅ Migración completada');
        process.exit(0);
    });
});
