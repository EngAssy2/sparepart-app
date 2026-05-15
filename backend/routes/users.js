const express = require('express');
const axios = require('axios');
const { verifyToken, requireLevel } = require('../middleware/auth');
const router = express.Router();

const CENTRAL_BASE = process.env.CENTRAL_AUTH_BASE_URL;
const API_KEY = process.env.CENTRAL_AUTH_API_KEY;

// Helper: read admin credentials from env (used for all admin-gated Central API calls)
function adminCreds() {
    return {
        admin_badge: process.env.CENTRAL_ADMIN_BADGE,
        admin_password: process.env.CENTRAL_ADMIN_PASSWORD,
    };
}

// Helper: forward a Central Auth API error to the client
function forwardError(res, err) {
    const status = err.response?.status || 502;
    const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Central Auth service error.';
    return res.status(status).json({ error: message });
}

// All user routes require a valid local JWT
router.use(verifyToken);

// ─────────────────────────────────────────────
// GET /api/users
// Fetches the authorized user list from Central Auth
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        console.log('[GET /users] req.user =', req.user);

        const centralRes = await axios.post(`${CENTRAL_BASE}/users/list`, {
            api_key: API_KEY,
        });

        const users = centralRes.data.users || [];
        console.log(`[GET /users] Central Auth returned ${users.length} users`);

        // Non-super-users only see their own record
        // authority_level 0 = Super User (can see all)
        const level = Number(req.user.authority_level);
        if (level !== 0) {
            console.log(`[GET /users] authority_level=${level} — returning own record only`);
            const own = users.find(u => u.User_Badge === req.user.badge);
            return res.json(own ? [own] : []);
        }

        console.log(`[GET /users] Super User — returning all ${users.length} users`);
        res.json(users);
    } catch (err) {
        console.error('[GET /users] Error:', err.response?.data || err.message);
        forwardError(res, err);
    }
});

// ─────────────────────────────────────────────
// POST /api/users — Register new user (Super User only)
// Proxies to Central Auth /auth/register
// ─────────────────────────────────────────────
router.post('/', requireLevel(0), async (req, res) => {
    const { User_Badge: _badge, User_name: _name, User_Section, User_Level, Authority_Level } = req.body;
    // Explicit trim as double protection
    const User_Badge = typeof _badge === 'string' ? _badge.trim() : _badge;
    const User_name  = typeof _name  === 'string' ? _name.trim()  : _name;

    if (!User_Badge || !User_name || !Authority_Level) {
        return res.status(400).json({ error: 'Badge, name, and authority level are required.' });
    }

    // Map Authority_Level number to User_Level string expected by Central API
    const levelMap = { 1: 'Super User', 2: 'Admin', 3: 'Supervisor', 4: 'Technician' };

    try {
        await axios.post(`${CENTRAL_BASE}/auth/register`, {
            badge_number: User_Badge,
            name: User_name,
            department: '', // not available from form; Central Auth may use optional field
            section: User_Section || '',
            password: 'user123', // Default password per existing business logic
            api_key: API_KEY,
            ...adminCreds(),
        });

        res.status(201).json({ message: 'User registered successfully.' });
    } catch (err) {
        forwardError(res, err);
    }
});

// ─────────────────────────────────────────────
// PUT /api/users/:badge — Modify user (or reset password)
// Proxies to Central Auth /auth/modify
// ─────────────────────────────────────────────
router.put('/:badge', async (req, res) => {
    const { badge } = req.params;

    // Non-super-users may only edit themselves
    if (req.user.authority_level !== 0 && req.user.badge !== badge) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { User_name, User_Section, User_Level, Authority_Level, Password } = req.body;

    // Detect "reset to default" (sent from UsersPage as Password: 'user123')
    const isReset = Password === 'user123';

    try {
        await axios.post(`${CENTRAL_BASE}/auth/modify`, {
            target_badge: badge,
            api_key: API_KEY,
            ...adminCreds(),
            name: User_name,
            department: '',
            section: User_Section || '',
            reset_password: isReset,
        });

        res.json({ message: 'User updated successfully.' });
    } catch (err) {
        forwardError(res, err);
    }
});

// ─────────────────────────────────────────────
// DELETE /api/users/:badge — Delete user (Super User only)
// Proxies to Central Auth /auth/delete
// ─────────────────────────────────────────────
router.delete('/:badge', requireLevel(0), async (req, res) => {
    const { badge } = req.params;

    if (badge === req.user.badge) {
        return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    try {
        await axios.post(`${CENTRAL_BASE}/auth/delete`, {
            target_badge: badge,
            api_key: API_KEY,
            ...adminCreds(),
        });

        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        forwardError(res, err);
    }
});

module.exports = router;
