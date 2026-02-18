const db = require('./database.js');
const { hashPassword } = require('./auth.js');

async function initializeDemoData() {
    console.log('🚀 Inicializando datos de demostración...');

    try {
        // 1. Crear usuario admin
        const adminPassword = await hashPassword('admin123');
        db.run(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, must_change_password) 
                VALUES (1, 'admin', ?, 'Administrador', 'admin', 1, 1)`, [adminPassword]);
        console.log('✅ Usuario admin creado');

        // 2. Crear empresa demo "FACTAPP S.L."
        db.run(`INSERT OR IGNORE INTO companies (id, company_name, cif, address, phone, email) 
                VALUES (1, 'FACTAPP S.L.', 'B12345678', 'Calle Mayor 123', '971123456', 'info@factapp.com')`,
            (err) => {
                if (err) console.error('Error creando empresa:', err);
                else console.log('✅ Empresa demo creada: FACTAPP S.L.');
            });

        // 3. Crear artículos/servicios de fontanería
        const articles = [
            { name: 'Reparación de fuga', description: 'Reparación de fuga en tubería', price: 45.00 },
            { name: 'Instalación de grifo', description: 'Instalación de grifo monomando', price: 65.00 },
            { name: 'Desatasco de tubería', description: 'Desatasco profesional', price: 80.00 },
            { name: 'Grifo monomando', description: 'Grifo monomando cromado', price: 35.00 },
            { name: 'Tubo PVC 32mm', description: 'Tubo PVC presión 32mm (metro)', price: 2.50 },
            { name: 'Codo PVC 90°', description: 'Codo PVC 90 grados 32mm', price: 1.20 },
            { name: 'Revisión general', description: 'Revisión completa de instalación', price: 55.00 },
            { name: 'Mano de obra', description: 'Hora de mano de obra', price: 35.00 }
        ];

        articles.forEach((article, index) => {
            db.run(`INSERT OR IGNORE INTO articles (id, name, description, unit_price, vat_rate) 
                    VALUES (?, ?, ?, ?, ?)`,
                [index + 1, article.name, article.description, article.price, 21],
                (err) => {
                    if (err) console.error(`Error creando artículo ${article.name}:`, err);
                });
        });
        console.log('✅ Artículos/servicios de fontanería creados');

        // 4. Crear factura demo
        setTimeout(() => {
            const invoiceDate = new Date().toISOString().split('T')[0];
            db.run(`INSERT OR IGNORE INTO invoices (
                    id, company_id, invoice_number, date, client_type, client_name, 
                    client_cif, client_address, subtotal, total_vat, total, is_cancelled
                ) VALUES (
                    1, 1, 'F-2024-001', ?, 'empresa', 'Hotel Mediterráneo S.L.', 
                    'B87654321', 'Paseo Marítimo 45, Palma', 145.00, 30.45, 175.45, 0
                )`, [invoiceDate], function (err) {
                if (err) {
                    console.error('Error creando factura demo:', err);
                } else {
                    console.log('✅ Factura demo creada');

                    // Crear líneas de factura
                    const invoiceItems = [
                        { article_id: 1, description: 'Reparación de fuga', quantity: 1, unit_price: 45.00 },
                        { article_id: 2, description: 'Instalación de grifo', quantity: 1, unit_price: 65.00 },
                        { article_id: 4, description: 'Grifo monomando cromado', quantity: 1, unit_price: 35.00 }
                    ];

                    invoiceItems.forEach((item, index) => {
                        const lineTotal = item.quantity * item.unit_price;
                        const lineVat = lineTotal * 0.21;
                        const lineTotalWithVat = lineTotal + lineVat;
                        db.run(`INSERT INTO invoice_items (
                                invoice_id, article_id, description, 
                                quantity, unit_price, vat_rate, line_total, line_vat, line_total_with_vat, sort_order
                            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [item.article_id, item.description, item.quantity, item.unit_price, 21, lineTotal, lineVat, lineTotalWithVat, index + 1]);
                    });
                    console.log('✅ Líneas de factura demo creadas');
                }
            });
        }, 1000);

        console.log('🎉 Datos de demostración inicializados correctamente');
        console.log('\n📋 Credenciales de acceso:');
        console.log('   Usuario: admin');
        console.log('   Contraseña: admin123');
        console.log('   ⚠️  IMPORTANTE: Cambia la contraseña en el primer acceso\n');

    } catch (error) {
        console.error('❌ Error inicializando datos demo:', error);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    // Esperar a que la base de datos esté lista
    setTimeout(() => {
        initializeDemoData();
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }, 1000);
}

module.exports = { initializeDemoData };
