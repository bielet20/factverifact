const verifactu = require('./verifactu');
const forge = require('node-forge');
const fs = require('fs');

async function runTest() {
    console.log('--- Test de Firma Digital Veri*Factu ---');

    // 1. Crear un certificado de prueba (autofirmado)
    console.log('Generando certificado de prueba...');
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [{
        name: 'commonName',
        value: 'Test VeriFactu'
    }, {
        name: 'countryName',
        value: 'ES'
    }, {
        shortName: 'ST',
        value: 'Madrid'
    }, {
        name: 'localityName',
        value: 'Madrid'
    }, {
        name: 'organizationName',
        value: 'Test Company'
    }, {
        shortName: 'OU',
        value: 'IT'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);

    // 2. Empaquetar en P12
    const password = 'password123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password);
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Base64 = forge.util.encode64(p12Der);

    console.log('Certificado P12 generado (Base64 length):', p12Base64.length);

    // 3. Probar la firma
    const testHash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // SHA-256 de "password"
    const companyData = {
        verifactu_certificate: p12Base64,
        verifactu_certificate_password: password
    };

    console.log('Firmando hash de prueba...');
    try {
        const signature = verifactu.generateVerifactuSignature(testHash, companyData);
        console.log('Firma generada (Base64):', signature);
        console.log('Longitud de la firma:', signature.length);

        if (signature.length > 100) {
            console.log('✅ TEST PASADO: La firma tiene una longitud coherente con RSA.');
        } else {
            console.log('❌ TEST FALLIDO: La firma es demasiado corta.');
        }
    } catch (error) {
        console.error('❌ ERROR durante la firma:', error.message);
    }
}

runTest();
