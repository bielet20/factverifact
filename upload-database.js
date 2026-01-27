/**
 * Database Upload/Migration Script
 * This script allows you to upload your local database to production
 * 
 * Usage:
 *   node upload-database.js <production-url>
 *   Example: node upload-database.js http://a4o88kc448ckcw040w8skc0c.45.134.39.235.sslip.io
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadDatabase() {
    const productionUrl = process.argv[2];

    if (!productionUrl) {
        console.error('❌ Error: Please provide production URL');
        console.log('Usage: node upload-database.js <production-url>');
        console.log('Example: node upload-database.js http://your-production-url.com');
        process.exit(1);
    }

    const dbPath = path.join(__dirname, 'invoices.db');

    if (!fs.existsSync(dbPath)) {
        console.error('❌ Error: Database file not found:', dbPath);
        process.exit(1);
    }

    console.log('📤 Uploading database to production...');
    console.log('   Local DB:', dbPath);
    console.log('   Production:', productionUrl);

    try {
        // Create form data
        const form = new FormData();
        form.append('database', fs.createReadStream(dbPath));
        form.append('secret', process.env.UPLOAD_SECRET || 'change-this-secret-key');

        // Upload to production
        const response = await fetch(`${productionUrl}/api/admin/upload-database`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Database uploaded successfully!');
            console.log('   ' + result.message);
            console.log('\n🎉 You can now login to production with your local credentials!');
        } else {
            console.error('❌ Upload failed:', result.error);
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error uploading database:', error.message);
        process.exit(1);
    }
}

uploadDatabase();
