const puppeteer = require('puppeteer');
const fs = require('fs');

async function test() {
    console.log('Starting Short-Path Test...');
    const userDataDir = '/tmp/s'; // Extremely short path
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/tmp/factapp/browsers/chromium/mac_arm-1585830/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
            userDataDir: userDataDir,
            dumpio: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--remote-debugging-port=0'
            ]
        });

        console.log('BROWSER LAUNCHED SUCCESSFULLY!');
        await browser.close();
    } catch (err) {
        console.error('SHORT PATH TEST FAILED:', err.message);
    }
}

test();
