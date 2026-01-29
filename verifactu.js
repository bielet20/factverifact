const forge = require('node-forge');

/**
 * Veri*Factu Utility Module
 * Implements blockchain-like integrity and QR code generation for Spanish invoice compliance
 */

/**
 * Generate SHA-256 hash for invoice data
 * @param {Object} invoiceData - Invoice data to hash
 * @returns {string} - SHA-256 hash
 */
function generateInvoiceHash(invoiceData) {
    const dataToHash = {
        company_id: invoiceData.company_id,
        invoice_number: invoiceData.invoice_number,
        invoice_sequence: invoiceData.invoice_sequence,
        date: invoiceData.date,
        client_cif: invoiceData.client_cif || '',
        subtotal: Number((invoiceData.subtotal || 0).toFixed(2)),
        total_vat: Number((invoiceData.total_vat || 0).toFixed(2)),
        total: Number((invoiceData.total || 0).toFixed(2)),
        previous_hash: invoiceData.previous_hash || 'GENESIS',
        timestamp: new Date().toISOString()
    };

    const dataString = JSON.stringify(dataToHash);
    return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Sign a hash using a P12 certificate
 * @param {string} hash - SHA-256 hash to sign
 * @param {string} p12Base64 - Base64 encoded P12 file
 * @param {string} password - Password for the P12 file
 * @returns {string} - Base64 encoded signature
 */
function signWithCertificate(hash, p12Base64, password) {
    try {
        const p12Der = forge.util.decode64(p12Base64);
        const p12Asn1 = forge.asn1.fromDer(p12Der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

        // Find the private key
        let privateKey;
        for (let i = 0; i < p12.safeContents.length; i++) {
            const safeContents = p12.safeContents[i];
            for (let j = 0; j < safeContents.safeBags.length; j++) {
                const safeBag = safeContents.safeBags[j];
                if (safeBag.key) {
                    privateKey = safeBag.key;
                    break;
                }
            }
            if (privateKey) break;
        }

        if (!privateKey) {
            throw new Error('No se encontró la clave privada en el certificado');
        }

        // Create RSA signature
        const md = forge.md.sha256.create();
        md.update(hash, 'utf8');
        const signature = privateKey.sign(md);
        return forge.util.encode64(signature);
    } catch (error) {
        console.error('Error signing with certificate:', error.message);
        throw new Error('Error al firmar con el certificado: ' + error.message);
    }
}

/**
 * Generate Veri*Factu signature
 * @param {string} hash - Invoice hash
 * @param {Object} companyData - Company data including certificate
 * @returns {string} - Digital signature
 */
function generateVerifactuSignature(hash, companyData) {
    if (companyData.verifactu_certificate && companyData.verifactu_certificate_password) {
        return signWithCertificate(hash, companyData.verifactu_certificate, companyData.verifactu_certificate_password);
    }

    // Fallback if no certificate is configured (for testing or backwards compatibility)
    const signatureData = {
        hash: hash,
        cif: companyData.cif,
        software_id: companyData.verifactu_software_id || 'SYS-FACT-001',
        timestamp: new Date().toISOString()
    };

    const signatureString = JSON.stringify(signatureData);
    return crypto.createHash('sha256').update(signatureString).digest('hex');
}

/**
 * Generate QR code data URL for invoice
 * Format according to AEAT specifications
 * @param {Object} invoiceData - Invoice data
 * @param {Object} companyData - Company data
 * @returns {Promise<string>} - QR code data URL
 */
async function generateInvoiceQR(invoiceData, companyData) {
    // QR data format for AEAT validation
    const qrData = {
        nif: companyData.cif,
        num: invoiceData.invoice_number,
        fecha: invoiceData.date,
        importe: invoiceData.total.toFixed(2),
        hash: invoiceData.current_hash.substring(0, 16) // First 16 chars of hash
    };

    // Create URL for AEAT verification (simplified)
    const verificationUrl = `https://sede.agenciatributaria.gob.es/verifactu?` +
        `nif=${encodeURIComponent(qrData.nif)}&` +
        `num=${encodeURIComponent(qrData.num)}&` +
        `fecha=${encodeURIComponent(qrData.fecha)}&` +
        `importe=${qrData.importe}&` +
        `hash=${qrData.hash}`;

    try {
        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 200,
            margin: 1
        });

        return qrDataUrl;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

/**
 * Validate invoice chain integrity
 * @param {Array} invoices - Array of invoices in sequence order
 * @returns {Object} - Validation result
 */
function validateInvoiceChain(invoices) {
    if (invoices.length === 0) {
        return { valid: true, message: 'No invoices to validate' };
    }

    for (let i = 0; i < invoices.length; i++) {
        const invoice = invoices[i];

        // Check sequence
        if (invoice.invoice_sequence !== i + 1) {
            return {
                valid: false,
                message: `Sequence break at invoice ${invoice.invoice_number}. Expected sequence ${i + 1}, got ${invoice.invoice_sequence}`,
                invoice_id: invoice.id
            };
        }

        // Check hash chain (skip first invoice)
        if (i > 0) {
            const previousInvoice = invoices[i - 1];
            if (invoice.previous_hash !== previousInvoice.current_hash) {
                return {
                    valid: false,
                    message: `Hash chain broken at invoice ${invoice.invoice_number}`,
                    invoice_id: invoice.id
                };
            }
        }
    }

    return { valid: true, message: 'Chain integrity verified' };
}

/**
 * Get next invoice sequence number for a company
 * @param {Object} db - Database connection
 * @param {number} companyId - Company ID
 * @returns {Promise<number>} - Next sequence number
 */
function getNextInvoiceSequence(db, companyId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT last_invoice_sequence FROM companies WHERE id = ?',
            [companyId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const nextSequence = (row?.last_invoice_sequence || 0) + 1;
                    resolve(nextSequence);
                }
            }
        );
    });
}

/**
 * Update company's last invoice sequence
 * @param {Object} db - Database connection
 * @param {number} companyId - Company ID
 * @param {number} sequence - New sequence number
 * @returns {Promise<void>}
 */
function updateCompanySequence(db, companyId, sequence) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE companies SET last_invoice_sequence = ? WHERE id = ?',
            [sequence, companyId],
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

/**
 * Get previous invoice hash for chaining
 * @param {Object} db - Database connection
 * @param {number} companyId - Company ID
 * @returns {Promise<string|null>} - Previous hash or null if first invoice
 */
function getPreviousInvoiceHash(db, companyId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT current_hash FROM invoices 
             WHERE company_id = ? AND is_cancelled = 0 
             ORDER BY invoice_sequence DESC LIMIT 1`,
            [companyId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row?.current_hash || null);
                }
            }
        );
    });
}

/**
 * Log audit entry
 * @param {Object} db - Database connection
 * @param {number} invoiceId - Invoice ID
 * @param {string} action - Action performed
 * @param {Object} details - Additional details
 * @returns {Promise<void>}
 */
function logAuditEntry(db, invoiceId, action, details = {}) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO invoice_audit_log (invoice_id, action, user_info, previous_state, new_state, ip_address) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                invoiceId,
                action,
                details.user_info || 'system',
                details.previous_state ? JSON.stringify(details.previous_state) : null,
                details.new_state ? JSON.stringify(details.new_state) : null,
                details.ip_address || null
            ],
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

/**
 * Format invoice number based on sequence and Veri*Factu status
 * @param {number} sequence - The sequence number
 * @param {boolean} verifactuEnabled - Whether Veri*Factu is enabled
 * @returns {string} - Formatted invoice number
 */
function formatInvoiceNumber(sequence, verifactuEnabled) {
    const currentYear = new Date().getFullYear();
    const paddedSequence = String(sequence).padStart(3, '0');
    const prefix = verifactuEnabled ? 'VF' : 'F';
    return `${prefix}${currentYear}-${paddedSequence}`;
}

module.exports = {
    generateInvoiceHash,
    generateVerifactuSignature,
    generateInvoiceQR,
    validateInvoiceChain,
    getNextInvoiceSequence,
    updateCompanySequence,
    getPreviousInvoiceHash,
    logAuditEntry,
    formatInvoiceNumber
};
