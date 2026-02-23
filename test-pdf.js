const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Starting Puppeteer test...');
    const userDataDir = path.join(__dirname, 'puppeteer_local_v3');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    // Set HOME to project dir to avoid restricted system paths
    process.env.HOME = __dirname;
    console.log(`Using HOME: ${process.env.HOME}`);
    console.log(`Using userDataDir (via args): ${userDataDir}`);

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/tmp/factapp/browsers/chromium/mac_arm-1585830/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
            // userDataDir: userDataDir, // DELIBERATELY OMITTED here to bypass Puppeteer's lock check
            dumpio: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=ProcessSingleton',
                '--user-data-dir=' + userDataDir,
                '--remote-debugging-port=0'
            ]
        });

        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        await page.setContent('<h1>Hello PDF - Isolated</h1>');
        const pdf = await page.pdf({ format: 'A4' });

        fs.writeFileSync('/tmp/test_output_isol.pdf', pdf);
        console.log('PDF generated successfully at /tmp/test_output_isol.pdf');

        await browser.close();
    } catch (err) {
        console.error('FAILED TO LAUNCH BROWSER:', err.message);
        console.error(err.stack);
    }
}

test();
