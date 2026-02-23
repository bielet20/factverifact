const puppeteer = require('puppeteer');
const fs = require('fs');

async function test() {
    console.log('Starting standard Puppeteer test...');
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        await page.setContent('<h1>Hello PDF</h1>');
        const pdf = await page.pdf({ format: 'A4' });
        fs.writeFileSync('/tmp/test_standard.pdf', pdf);
        console.log('PDF generated at /tmp/test_standard.pdf');
        await browser.close();
    } catch (err) {
        console.error('Puppeteer launch failed:', err.message);
    }
}

test();
