const { generateInvoicePDF } = require('./pdfGenerator.js');
const fs = require('fs');

const invoiceData = {
    invoice_number: 'TEST-001',
    date: new Date().toISOString(),
    client_name: 'Cliente de Prueba',
    client_cif: '12345678Z',
    client_address: 'Calle Falsa 123',
    subtotal: 100,
    total_vat: 21,
    total: 121,
    items: [
        { description: 'Item 1', quantity: 1, unit_price: 100, vat_rate: 21, line_total: 100 }
    ]
};

const companyData = {
    company_name: 'Mi Empresa',
    cif: 'B87654321',
    address: 'Avenida Principal 45',
    phone: '900111222',
    email: 'info@empresa.com'
};

async function verify() {
    console.log('Verifying PDF generation with simplified Puppeteer launch...');
    try {
        const pdf = await generateInvoicePDF(invoiceData, companyData);
        if (pdf && pdf.length > 0) {
            fs.writeFileSync('/tmp/verify_fix.pdf', pdf);
            console.log('✅ SUCCESS: PDF generated correctly and saved to /tmp/verify_fix.pdf');
        } else {
            console.error('❌ FAILURE: PDF buffer is empty');
        }
    } catch (err) {
        console.error('❌ FAILURE: PDF generation threw an error:', err.message);
        console.error(err.stack);
    }
}

verify();
