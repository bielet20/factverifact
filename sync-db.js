const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration - UPDATE THIS TO MATCH YOUR SERVER
const SERVER_URL = process.env.COOLIFY_FQDN || 'http://45.134.39.235:3000';
const USERNAME = 'admin';
const PASSWORD = 'admin123'; // Make sure this is correct

async function sync() {
    console.log(`🚀 Iniciando sincronización desde ${SERVER_URL}...`);

    try {
        // 1. Login to get session cookie
        const loginData = JSON.stringify({ username: USERNAME, password: PASSWORD });
        const protocol = SERVER_URL.startsWith('https') ? https : http;

        console.log('🔑 Iniciando sesión...');
        const loginRes = await new Promise((resolve, reject) => {
            const req = protocol.request(`${SERVER_URL}/api/auth/login`, {
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

        if (loginRes.statusCode !== 200) {
            throw new Error(`Error de login: ${loginRes.statusCode}`);
        }

        const cookie = loginRes.headers['set-cookie'];
        if (!cookie) {
            throw new Error('No se recibió cookie de sesión');
        }
        console.log('✅ Sesión iniciada');

        // 2. Create a fresh backup on the server
        console.log('📦 Creando backup en el servidor...');
        const backupRes = await new Promise((resolve, reject) => {
            const req = protocol.request(`${SERVER_URL}/api/backups/create`, {
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

        if (backupRes.statusCode !== 200) {
            throw new Error(`Error creando backup: ${backupRes.body.error}`);
        }

        const backupName = backupRes.body.name;
        console.log(`✅ Backup creado: ${backupName}`);

        // 3. Download the backup
        console.log('📥 Descargando backup...');
        const downloadPath = path.join(__dirname, 'temp_backup.zip');
        const file = fs.createWriteStream(downloadPath);

        await new Promise((resolve, reject) => {
            protocol.get(`${SERVER_URL}/api/backups/${backupName}/download`, {
                headers: { 'Cookie': cookie }
            }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Error descargando backup: ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', reject);
        });
        console.log('✅ Backup descargado');

        // 4. Extract invoices.db from the zip
        // Since we don't want to add more dependencies if possible, 
        // and we already have 'extract-zip' in package.json from the app
        console.log('📂 Extrayendo invoices.db...');
        const extract = require('extract-zip');
        const tempExtractPath = path.join(__dirname, 'temp_extract');

        if (!fs.existsSync(tempExtractPath)) fs.mkdirSync(tempExtractPath);

        await extract(downloadPath, { dir: tempExtractPath });

        const extractedDbPath = path.join(tempExtractPath, 'invoices.db');
        if (fs.existsSync(extractedDbPath)) {
            fs.copyFileSync(extractedDbPath, path.join(__dirname, 'invoices.db'));
            console.log('✨ Base de datos local actualizada correctamente!');
        } else {
            throw new Error('No se encontró invoices.db dentro del backup');
        }

        // 5. Cleanup
        fs.unlinkSync(downloadPath);
        fs.rmSync(tempExtractPath, { recursive: true, force: true });
        console.log('🧹 Limpieza completada');

    } catch (error) {
        console.error('❌ Error durante la sincronización:', error.message);
        process.exit(1);
    }
}

sync();
