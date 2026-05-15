const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const router = express.Router();

const CENTRAL_BASE = process.env.CENTRAL_AUTH_BASE_URL;
const API_KEY = process.env.CENTRAL_AUTH_API_KEY;

// Helper: forward a Central Auth API error to the client
function forwardError(res, err) {
    const status = err.response?.status || 502;
    const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Central Auth service error.';
    return res.status(status).json({ error: message });
}

// ─────────────────────────────────────────────
// POST /api/auth/login
// Proxies to Central Auth /auth/verify
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { badge: _badge, password: _password } = req.body;
        const badge    = typeof _badge    === 'string' ? _badge.trim()    : _badge;
        const password = typeof _password === 'string' ? _password.trim() : _password;
        if (!badge) {
            return res.status(400).json({ error: 'Badge number is required.' });
        }

        // Call Central Auth API
        const centralRes = await axios.post(`${CENTRAL_BASE}/auth/verify`, {
            badge_number: badge,
            password: password || '',
            api_key: API_KEY,
        });

        const { user } = centralRes.data;

        // Re-sign a local JWT so session management stays under our control
        const token = jwt.sign(
            {
                badge: user.User_Badge,
                name: user.User_Name,
                section: user.User_Section,
                department: user.User_Department,
                user_level: user.User_Level,
                authority_level: user.Authority_Level,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        res.json({ token, user });
    } catch (err) {
        forwardError(res, err);
    }
});

// ─────────────────────────────────────────────
// POST /api/auth/change-password  (authenticated)
// Proxies to Central Auth /auth/change-password
// ─────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
    // Verify local JWT first
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token.' });

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    try {
        await axios.post(`${CENTRAL_BASE}/auth/change-password`, {
            badge_number: decoded.badge,
            old_password: currentPassword,
            new_password: newPassword,
            api_key: API_KEY,
        });

        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        forwardError(res, err);
    }
});

module.exports = router;
