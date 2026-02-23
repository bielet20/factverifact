const fetch = require('node-fetch');

async function testFinalize() {
    const baseUrl = 'http://localhost:3000';

    // 1. Login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const cookie = loginRes.headers.get('set-cookie');

    // 2. Create Draft
    const draftRes = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
            company_id: 1,
            client_name: 'Debug Client',
            client_cif: '12345678Z',
            items: [{ description: 'Item', quantity: 1, unit_price: 10, line_total: 10, line_vat: 2.1, line_total_with_vat: 12.1 }],
            status: 'draft',
            invoice_number: `T-${Date.now()}`,
            date: '2026-02-17'
        })
    });
    const draft = await draftRes.json();
    console.log('CREATE RESPONSE:', JSON.stringify(draft, null, 2));

    if (!draft.id) {
        console.error('FAILED TO CREATE DRAFT');
        return;
    }

    // 3. Finalize
    console.log(`FINALIZING INVOICE ${draft.id}...`);
    const finalizeRes = await fetch(`${baseUrl}/api/invoices/${draft.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
    });
    const finalizeResult = await finalizeRes.json();
    console.log('FINALIZE RESPONSE:', JSON.stringify(finalizeResult, null, 2));

    // 4. Check list
    const listRes = await fetch(`${baseUrl}/api/invoices`, { headers: { 'Cookie': cookie } });
    const list = await listRes.json();
    const inv = list.data.find(i => i.id === draft.id);
    console.log('INVOICE AFTER FINALIZE:', JSON.stringify(inv, null, 2));
}

testFinalize();
