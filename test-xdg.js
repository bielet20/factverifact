const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Starting XDG-Isolation Test...');

    const baseDir = '/tmp/p_iso';
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    const xdgDir = path.join(baseDir, 'xdg');
    const userDataDir = path.join(baseDir, 'user');
    if (!fs.existsSync(xdgDir)) fs.mkdirSync(xdgDir, { recursive: true });
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    // Isolation variables
    process.env.XDG_CONFIG_HOME = xdgDir;
    process.env.XDG_CACHE_HOME = xdgDir;
    process.env.XDG_DATA_HOME = xdgDir;
    process.env.HOME = baseDir;
    process.env.TMPDIR = baseDir;

    console.log(`Isolation Base: ${baseDir}`);

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            userDataDir: userDataDir,
            dumpio: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=ProcessSingleton',
                '--remote-debugging-port=0'
            ]
        });

        console.log('BROWSER LAUNCHED SUCCESSFULLY!');
        const page = await browser.newPage();
        await page.setContent('<h1>Isolation Success</h1>');
        const pdf = await page.pdf({ format: 'A4' });
        fs.writeFileSync(path.join(baseDir, 'output.pdf'), pdf);
        console.log('PDF Generated!');

        await browser.close();
    } catch (err) {
        console.error('XDG TEST FAILED:', err.message);
    }
}

test();
