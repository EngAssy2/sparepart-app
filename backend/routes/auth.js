const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { badge, password } = req.body;
        if (!badge || !password) {
            return res.status(400).json({ error: 'Badge and password are required.' });
        }

        const [rows] = await pool.query(
            'SELECT * FROM userlist WHERE User_Badge = ?',
            [badge]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid badge or password.' });
        }

        const user = rows[0];

        if (!user.password) {
            return res.status(401).json({ error: 'Account not set up with a password. Contact admin.' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid badge or password.' });
        }

        const token = jwt.sign(
            {
                badge: user.User_Badge,
                name: user.User_Name,
                section: user.User_Section,
                user_level: user.User_Level,
                authority_level: user.Authority_Level,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        res.json({
            token,
            user: {
                User_Badge: user.User_Badge,
                User_Name: user.User_Name,
                User_Section: user.User_Section,
                User_Level: user.User_Level,
                Authority_Level: user.Authority_Level,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/auth/change-password  (authenticated)
router.post('/change-password', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token.' });

    let user;
    try {
        user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(403).json({ error: 'Invalid token.' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    try {
        const [rows] = await pool.query('SELECT Password FROM userlist WHERE User_Badge = ?', [user.badge]);
        if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

        if (rows[0].Password) {
            const ok = await bcrypt.compare(currentPassword, rows[0].Password);
            if (!ok) return res.status(401).json({ error: 'Current password incorrect.' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE userlist SET Password = ? WHERE User_Badge = ?', [hash, user.badge]);
        res.json({ message: 'Password updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
