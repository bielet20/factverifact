const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Starting Puppeteer "Shotgun" test...');

    // Use a completely unique leaf directory for this specific run
    const sessionID = Date.now().toString();
    const userDataDir = path.join(__dirname, 'pdata_shotgun_' + sessionID);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    // Set a neutral HOME and TMPDIR to minimize system interference
    process.env.HOME = userDataDir;
    process.env.TMPDIR = '/tmp';

    console.log(`Using isolated HOME: ${process.env.HOME}`);
    console.log(`Using userDataDir: ${userDataDir}`);

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/tmp/factapp/browsers/chromium/mac_arm-1585830/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
            dumpio: true,
            ignoreDefaultArgs: true, // Take absolute control
            args: [
                '--headless',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-breakpad',
                '--disable-crash-reporter',
                '--crash-dump-dir=/tmp/factapp/crash',
                '--user-data-dir=' + userDataDir,
                '--disable-features=ProcessSingleton,IsolateOrigins,site-per-process',
                '--remote-debugging-port=0',
                '--no-first-run',
                '--no-default-browser-check',
                '--use-mock-keychain',
                '--password-store=basic',
                '--disable-extensions',
                '--disable-component-update',
                '--disable-background-networking',
                '--disable-sync'
            ]
        });

        console.log('BROWSER LAUNCHED SUCCESSFULLY!');
        const page = await browser.newPage();
        await page.setContent('<h1>PDF Generation - Shotgun Approach Success</h1>');
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true
        });

        const outputPath = path.join(__dirname, 'output_shotgun.pdf');
        fs.writeFileSync(outputPath, pdf);
        console.log(`PDF GENERATED SUCCESSFULLY at ${outputPath}`);

        await browser.close();
    } catch (err) {
        console.error('SHOTGUN TEST FAILED:', err.message);
        console.error(err.stack);
    }
}

test();
