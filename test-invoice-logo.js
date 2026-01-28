const { generateInvoicePDF } = require('./pdfGenerator');
const fs = require('fs').promises;
const path = require('path');

async function testGeneration() {
    console.log('🚀 Iniciando prueba de generación de factura con logo...');

    const logoPath = '/Users/bielrivero/.gemini/antigravity/brain/60a06f37-591b-41ab-99f7-c1d73e94690f/test_company_logo_1769607052248.png';
    const logoDest = path.join(__dirname, 'public', 'uploads', 'logos', 'test_logo.png');

    try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(logoDest), { recursive: true });

        // Copy logo to public uploads (simulating an upload)
        await fs.copyFile(logoPath, logoDest);
        console.log('✅ Logo de prueba copiado a uploads.');

        const companyData = {
            company_name: 'Nofre Plomer S.L.',
            cif: 'B-12345678',
            address: 'Calle Mayor 1, 07001 Palma',
            phone: '971 123 456',
            email: 'info@nofreplomer.com',
            bank_iban: 'ES12 3456 7890 1234 5678 9012',
            logo: '/uploads/logos/test_logo.png',
            verifactu_enabled: 1
        };

        const invoiceData = {
            invoice_number: 'VF-2026-001',
            date: new Date().toISOString(),
            client_name: 'Juan Pérez García',
            client_cif: '12345678X',
            client_address: 'Avenida de la Constitución 42, Palma',
            subtotal: 100.00,
            total_vat: 21.00,
            total: 121.00,
            items: [
                {
                    quantity: 1,
                    description: 'Reparación de fuga en baño principal',
                    unit_price: 100.00,
                    vat_rate: 21,
                    line_total: 100.00
                }
            ],
            qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // Placeholder QR
            current_hash: 'abc123456789def'
        };

        console.log('📄 Generando PDF...');
        const pdfBuffer = await generateInvoicePDF(invoiceData, companyData);

        const outputPath = path.join(__dirname, 'test-invoice-with-logo.pdf');
        await fs.writeFile(outputPath, pdfBuffer);

        console.log(`\n✨ Factura generada con éxito: ${outputPath}`);
        console.log('Por favor, abre el archivo para verificar que el logo aparece correctamente encuadrado.');

    } catch (error) {
        console.error('❌ Error en el test:', error);
    }
}

testGeneration();
