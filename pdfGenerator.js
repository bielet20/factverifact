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
            const logoPath = path.join(__dirname, 'public', companyData.logo);
            const logoBuffer = await fs.readFile(logoPath);
            const logoExt = path.extname(companyData.logo).substring(1);
            companyLogo = `data:image/${logoExt};base64,${logoBuffer.toString('base64')}`;
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

        // Launch Puppeteer with extreme isolation
        const crypto = require('crypto');
        const sessionID = crypto.randomBytes(8).toString('hex');
        const userDataDir = path.join('/tmp/factapp/p', sessionID);

        if (!require('fs').existsSync(userDataDir)) {
            require('fs').mkdirSync(userDataDir, { recursive: true });
        }

        // Set isolation environment
        process.env.HOME = userDataDir;
        process.env.XDG_CONFIG_HOME = userDataDir;
        process.env.TMPDIR = userDataDir;

        const browser = await puppeteer.launch({
            headless: true,
            userDataDir: userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=ProcessSingleton,IsolateOrigins,site-per-process',
                '--disable-breakpad',
                '--disable-crash-reporter',
                '--no-first-run',
                '--no-default-browser-check',
                '--remote-debugging-port=0'
            ]
        });

        let pdfBuffer;
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
            });
        } finally {
            await browser.close();
            // Clean up to avoid disk filling
            try {
                const fsExtra = require('fs');
                if (fsExtra.rmSync) fsExtra.rmSync(userDataDir, { recursive: true, force: true });
            } catch (e) { }
        }

        return pdfBuffer;

    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
}

module.exports = { generateInvoicePDF, renderInvoiceHTML };
