const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

const logFile = '/tmp/factapp_pdf.log';
require('fs').appendFileSync(logFile, `[Module] Loading pdfGenerator.js at ${new Date().toISOString()}\n`);

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

handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

handlebars.registerHelper('uppercase', function (str) {
    if (str && typeof str === 'string') {
        return str.toUpperCase();
    }
    return str;
});

async function renderInvoiceHTML(invoiceData, companyData) {
    // Read the HTML template
    const templatePath = path.join(__dirname, 'templates', 'invoice.html');
    const templateContent = await fs.readFile(templatePath, 'utf-8');

    // Compile the template
    const template = handlebars.compile(templateContent);

    // Process company logo if exists
    let companyLogo = null;
    if (companyData.logo) {
        try {
            // Priority locations for logo file
            const possiblePaths = [
                path.join(__dirname, 'public', companyData.logo), // Relative to public (e.g. /uploads/logos/file.png)
                path.join(__dirname, companyData.logo),        // Relative to root
                path.join(__dirname, 'public', 'uploads', 'logos', path.basename(companyData.logo)), // Standard upload dir
                // Docker persistent paths
                path.join('/app/data/uploads/logos', path.basename(companyData.logo)),
                path.join('/app/data/uploads', path.basename(companyData.logo)),
                // Add persistent volume path if configured in environment
                process.env.UPLOADS_PATH ? (process.env.UPLOADS_PATH.endsWith('logos') ? path.join(process.env.UPLOADS_PATH, path.basename(companyData.logo)) : path.join(process.env.UPLOADS_PATH, 'logos', path.basename(companyData.logo))) : null
            ].filter(p => p !== null);

            let logoPath = null;
            for (const p of possiblePaths) {
                try {
                    await fs.access(p);
                    logoPath = p;
                    console.log(`[PDF] Found logo at: ${logoPath}`);
                    break;
                } catch (e) {
                    // Continue to next path
                }
            }

            if (logoPath) {
                const logoBuffer = await fs.readFile(logoPath);
                const logoExt = path.extname(logoPath).substring(1) || 'png';
                companyLogo = `data:image/${logoExt};base64,${logoBuffer.toString('base64')}`;
            } else {
                console.warn(`[PDF] Logo not found in any expected location: ${companyData.logo}`);
            }
        } catch (err) {
            console.warn('Could not load company logo:', err.message);
        }
    }

    // Prepare data for template
    const data = {
        invoice: invoiceData,
        company: {
            ...companyData,
            logoBase64: companyLogo
        }
    };

    // Generate HTML
    return template(data);
}

async function generateInvoicePDF(invoiceData, companyData) {
    try {
        require('fs').appendFileSync(logFile, `[Function] generateInvoicePDF called at ${new Date().toISOString()}\n`);

        const html = await renderInvoiceHTML(invoiceData, companyData);

        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check'
            ]
        };

        // If executable path is provided via env (common in Docker), use it
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            console.log(`[PDF] Using executable path: ${launchOptions.executablePath}`);
        }

        const browser = await puppeteer.launch(launchOptions);

        let pdfBuffer;
        try {
            const page = await browser.newPage();
            await page.setContent(html, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
            });
        } finally {
            if (browser) await browser.close();
        }

        return Buffer.from(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
}

module.exports = { generateInvoicePDF, renderInvoiceHTML };
