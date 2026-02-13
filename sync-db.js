const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

/**
 * CONFIGURATION: Add your apps here
 */
const APPS = [
    {
        name: 'invoice-app',
        url: process.env.URL_INVOICE_APP || 'http://45.134.39.235:3000',
        user: 'admin',
        pass: 'admin123',
        dbFile: 'invoices.db'
    }
    // {
    //     name: 'another-app',
    //     url: 'http://another-app.com',
    //     user: 'admin',
    //     pass: 'password',
    //     dbFile: 'app.db'
    // }
];

async function syncApp(app) {
    console.log(`\n--- 🚀 Sincronizando: ${app.name} (${app.url}) ---`);

    try {
        const protocol = app.url.startsWith('https') ? https : http;
        const loginData = JSON.stringify({ username: app.user, password: app.pass });

        // 1. Login
        console.log('🔑 Iniciando sesión...');
        const loginRes = await new Promise((resolve, reject) => {
            const req = protocol.request(`${app.url}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': loginData.length
                }
            }, resolve);
            req.on('error', reject);
            req.write(loginData);
            req.end();
        });

        if (loginRes.statusCode !== 200) throw new Error(`Login fallido: ${loginRes.statusCode}`);

        const cookie = loginRes.headers['set-cookie'];
        if (!cookie) throw new Error('No cookie received');

        // 2. Create Backup
        console.log('📦 Creando backup...');
        const backupRes = await new Promise((resolve, reject) => {
            const req = protocol.request(`${app.url}/api/backups/create`, {
                method: 'POST',
                headers: { 'Cookie': cookie }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ body: JSON.parse(body), statusCode: res.statusCode }));
            });
            req.on('error', reject);
            req.end();
        });

        if (backupRes.statusCode !== 200) throw new Error(`Backup fallido: ${backupRes.body.error}`);

        const backupName = backupRes.body.name;

        // 3. Download
        console.log('📥 Descargando...');
        const localDataDir = path.join(__dirname, 'vault', app.name);
        if (!fs.existsSync(localDataDir)) fs.mkdirSync(localDataDir, { recursive: true });

        const downloadPath = path.join(localDataDir, 'temp_backup.zip');
        const file = fs.createWriteStream(downloadPath);

        await new Promise((resolve, reject) => {
            protocol.get(`${app.url}/api/backups/${backupName}/download`, {
                headers: { 'Cookie': cookie }
            }, (res) => {
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
        });

        // 4. Extract
        console.log('📂 Procesando archivo...');
        const extract = require('extract-zip');
        const tempPath = path.join(localDataDir, 'temp_extract');
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);

        await extract(downloadPath, { dir: path.resolve(tempPath) });

        const extractedDbPath = path.join(tempPath, app.dbFile);
        if (fs.existsSync(extractedDbPath)) {
            // Guardamos la copia principal en la raíz de la carpeta del app en el vault
            fs.copyFileSync(extractedDbPath, path.join(localDataDir, app.dbFile));
            // TAMBIÉN actualizamos el archivo en la raíz del proyecto para compatibilidad con el deploy actual
            if (app.name === 'invoice-app') {
                fs.copyFileSync(extractedDbPath, path.join(__dirname, app.dbFile));
            }
            console.log(`✨ Backup de ${app.name} completado con éxito.`);
        }

        // Cleanup
        fs.unlinkSync(downloadPath);
        fs.rmSync(tempPath, { recursive: true, force: true });

    } catch (err) {
        console.error(`❌ Error sincronizando ${app.name}:`, err.message);
    }
}

async function run() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   DB VAULT - GESTOR DE SINCRONIZACIÓN  ║');
    console.log('╚════════════════════════════════════════╝');

    for (const app of APPS) {
        await syncApp(app);
    }

    console.log('\n✅ Proceso de sincronización finalizado.');
}

run();
