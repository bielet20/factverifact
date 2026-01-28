const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        console.warn(`[Auth Warning] Unauthorized access attempt: ${req.method} ${req.url}`);
        console.warn(`[Auth Warning] Session ID: ${req.sessionID || 'None'}`);
        console.warn(`[Auth Warning] Has Session object: ${!!req.session}`);
        console.warn(`[Auth Warning] Has User in Session: ${!!(req.session && req.session.user)}`);
        res.status(401).json({ error: 'No autorizado. Por favor, inicia sesión.' });
    }
}

/**
 * Middleware to check if user has required role
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'No autorizado. Por favor, inicia sesión.' });
        }

        if (allowedRoles.includes(req.session.user.role)) {
            next();
        } else {
            res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
        }
    };
}

/**
 * Get current user from session
 */
function getCurrentUser(req) {
    return req.session?.user || null;
}

module.exports = {
    hashPassword,
    verifyPassword,
    requireAuth,
    requireRole,
    getCurrentUser
};
