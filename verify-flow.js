const fetch = require('node-fetch');

async function verifyFlow() {
    const baseUrl = 'http://localhost:3000';
    let cookie = '';

    console.log('🚀 Starting Verification: Draft -> Proforma -> Final -> Delete');

    // 1. Login
    try {
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });
        cookie = loginRes.headers.get('set-cookie');
        console.log('✅ Logged in');
    } catch (e) {
        console.error('❌ Login failed. Is the server running?');
        return;
    }

    // 2. Create Draft
    const draftData = {
        company_id: 1,
        client_name: 'Test Client',
        client_cif: '12345678Z',
        items: [{ description: 'Test Item', quantity: 1, unit_price: 100, vat_rate: 21, line_total: 100, line_vat: 21, line_total_with_vat: 121 }],
        status: 'draft',
        invoice_number: `DRAFT-${Date.now()}`,
        date: new Date().toISOString().split('T')[0]
    };

    const draftRes = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify(draftData)
    });
    const draft = await draftRes.json();
    console.log('DEBUG Draft Response:', draft);
    const invoiceId = draft.id;
    console.log(`✅ Draft created with ID: ${invoiceId}`);

    // 3. Convert to Proforma
    const proformaRes = await fetch(`${baseUrl}/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ ...draftData, status: 'proforma' })
    });
    console.log('✅ Converted to Proforma (Status:', (await proformaRes.json()).message, ')');

    // 4. Verify in List
    const listRes = await fetch(`${baseUrl}/api/invoices`, { headers: { 'Cookie': cookie } });
    const list = await listRes.json();
    const found = list.data.find(inv => inv.id === invoiceId);
    console.log(`✅ Invoice found in list. Status: ${found.status}`);

    // 5. Finalize
    const finalizeRes = await fetch(`${baseUrl}/api/invoices/${invoiceId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
    });
    const finalResult = await finalizeRes.json();
    console.log('DEBUG Finalize Response:', finalResult);

    // 6. Verify Final status
    const listRes2 = await fetch(`${baseUrl}/api/invoices`, { headers: { 'Cookie': cookie } });
    const fullList = await listRes2.json();
    const finalInv = fullList.data.find(inv => inv.id === invoiceId);
    if (finalInv) {
        console.log(`✅ Final Invoice Details - Number: ${finalInv.invoice_number}, Status: ${finalInv.status}`);
    } else {
        console.log('❌ Error: Final invoice not found in list');
    }

    // 7. Test Logical Delete (Create another draft and delete it)
    const draft2Res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ ...draftData, invoice_number: 'TO-DELETE' })
    });
    const draft2Id = (await draft2Res.json()).id;
    console.log(`✅ Second Draft created with ID: ${draft2Id}`);

    const deleteRes = await fetch(`${baseUrl}/api/invoices/${draft2Id}`, {
        method: 'DELETE',
        headers: { 'Cookie': cookie }
    });
    console.log('✅ Logical delete executed:', (await deleteRes.json()).message);

    const listRes3 = await fetch(`${baseUrl}/api/invoices`, { headers: { 'Cookie': cookie } });
    const stillExists = (await listRes3.json()).data.find(inv => inv.id === draft2Id);
    if (!stillExists) {
        console.log('✅ Confirmation: Deleted invoice is NOT in the list');
    } else {
        console.log('❌ Error: Deleted invoice still visible in list');
    }

    console.log('🏁 Verification complete!');
}

verifyFlow();
