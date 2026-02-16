/**
 * Email Service
 * Handles sending emails for password recovery and notifications
 */

const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, token, userName) {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;

    const mailOptions = {
        from: process.env.SMTP_FROM || '"Sistema de Facturas" <noreply@facturas.local>',
        to: email,
        subject: '🔑 Recuperación de Contraseña',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔑 Recuperación de Contraseña</h1>
                    </div>
                    <div class="content">
                        <p>Hola <strong>${userName}</strong>,</p>
                        <p>Has solicitado recuperar tu contraseña del Sistema de Gestión de Facturas.</p>
                        <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                        <p style="text-align: center;">
                            <a href="${resetUrl}" class="button">Resetear Contraseña</a>
                        </p>
                        <p>O copia y pega este enlace en tu navegador:</p>
                        <p style="background: white; padding: 10px; border-radius: 5px; word-break: break-all;">
                            ${resetUrl}
                        </p>
                        <p><strong>⚠️ Este enlace expira en 1 hora.</strong></p>
                        <p>Si no solicitaste este cambio, ignora este email.</p>
                    </div>
                    <div class="footer">
                        <p>Sistema de Gestión de Facturas - FACTAPP</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Password reset email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
}

/**
 * Send root user credentials email
 */
async function sendRootCredentialsEmail(email, password) {
    const mailOptions = {
        from: process.env.SMTP_FROM || '"Sistema de Facturas" <noreply@facturas.local>',
        to: email,
        subject: '🔐 Credenciales de Usuario Root',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .credentials { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0; }
                    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Usuario Root Creado</h1>
                    </div>
                    <div class="content">
                        <p>Se ha creado el usuario root del Sistema de Gestión de Facturas.</p>
                        <div class="credentials">
                            <p><strong>Usuario:</strong> root</p>
                            <p><strong>Contraseña:</strong> <code>${password}</code></p>
                            <p><strong>Email:</strong> ${email}</p>
                        </div>
                        <div class="warning">
                            <p><strong>⚠️ IMPORTANTE:</strong></p>
                            <ul>
                                <li>Guarda esta contraseña en un lugar seguro</li>
                                <li>Cambia la contraseña después del primer login</li>
                                <li>Este usuario tiene acceso total al sistema</li>
                                <li>Este email se envía solo una vez</li>
                            </ul>
                        </div>
                        <p>Puedes usar estas credenciales para acceder al sistema en caso de emergencia o si pierdes el acceso a otros usuarios administradores.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Root credentials email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Error sending root credentials email:', error);
        // Don't throw - root user should still be created even if email fails
        return false;
    }
}

/**
 * Test email configuration
 */
async function testEmailConfig() {
    try {
        await transporter.verify();
        console.log('✅ Email server is ready');
        return true;
    } catch (error) {
        console.error('❌ Email server error:', error.message);
        return false;
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendRootCredentialsEmail,
    testEmailConfig
};
