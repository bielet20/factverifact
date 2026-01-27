const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

// Register Handlebars helpers
handlebars.registerHelper('formatCurrency', function (amount) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount || 0);
});

handlebars.registerHelper('formatDate', function (dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
});

async function generateInvoicePDF(invoiceData, companyData) {
    try {
        // Read the HTML template
        const templatePath = path.join(__dirname, 'templates', 'invoice.html');
        const templateContent = await fs.readFile(templatePath, 'utf-8');

        // Compile the template
        const template = handlebars.compile(templateContent);

        // Prepare data for template
        const data = {
            invoice: invoiceData,
            company: companyData
        };

        // Generate HTML
        const html = template(data);

        // Launch Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Set content
        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            }
        });

        await browser.close();

        return pdfBuffer;

    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
}

module.exports = { generateInvoicePDF };
