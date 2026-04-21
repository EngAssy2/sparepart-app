const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyToken, requireLevel } = require('../middleware/auth');
const router = express.Router();

// All user routes require token
router.use(verifyToken);

// GET /api/users
router.get('/', async (req, res) => {
    try {
        if (req.user.authority_level !== 1) {
            // Non-super users only see themselves
            const [rows] = await pool.query(
                'SELECT User_Badge, User_name, User_Section, User_Level, Authority_Level FROM userlist WHERE User_Badge = ?',
                [req.user.badge]
            );
            return res.json(rows);
        }

        const [rows] = await pool.query(
            'SELECT User_Badge, User_name, User_Section, User_Level, Authority_Level FROM userlist ORDER BY Authority_Level, User_name'
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/users - Create user
router.post('/', requireLevel(1), async (req, res) => {
    try {
        const { User_Badge, User_name, User_Section, User_Level, Authority_Level } = req.body;
        const Password = req.body.Password || 'user123';
        if (!User_Badge || !User_name || !Authority_Level) {
            return res.status(400).json({ error: 'Badge, name, and authority level required.' });
        }
        if (Password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        const hash = await bcrypt.hash(Password, 10);
        await pool.query(
            'INSERT INTO userlist (User_Badge, User_name, User_Section, User_Level, Authority_Level, Password) VALUES (?,?,?,?,?,?)',
            [User_Badge, User_name, User_Section || '', User_Level || '', parseInt(Authority_Level), hash]
        );
        res.status(201).json({ message: 'User created.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Badge already exists.' });
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PUT /api/users/:badge - Update user
router.put('/:badge', async (req, res) => {
    try {
        if (req.user.authority_level !== 1 && req.user.badge !== req.params.badge) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { User_name, User_Section, User_Level, Authority_Level, Password } = req.body;
        
        let query, params;
        if (req.user.authority_level !== 1) {
            // Non-super users can only update password
            if (Password) {
                if (Password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
                const hash = await bcrypt.hash(Password, 10);
                query = 'UPDATE userlist SET Password=? WHERE User_Badge=?';
                params = [hash, req.params.badge];
            } else {
                return res.json({ message: 'No changes made.' });
            }
        } else {
            if (Password) {
                if (Password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
                const hash = await bcrypt.hash(Password, 10);
                query = 'UPDATE userlist SET User_name=?, User_Section=?, User_Level=?, Authority_Level=?, Password=? WHERE User_Badge=?';
                params = [User_name, User_Section, User_Level, parseInt(Authority_Level), hash, req.params.badge];
            } else {
                query = 'UPDATE userlist SET User_name=?, User_Section=?, User_Level=?, Authority_Level=? WHERE User_Badge=?';
                params = [User_name, User_Section, User_Level, parseInt(Authority_Level), req.params.badge];
            }
        }
        
        const [result] = await pool.query(query, params);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'User updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// DELETE /api/users/:badge
router.delete('/:badge', requireLevel(1), async (req, res) => {
    try {
        if (req.params.badge === req.user.badge) {
            return res.status(400).json({ error: 'Cannot delete your own account.' });
        }
        const [result] = await pool.query('DELETE FROM userlist WHERE User_Badge = ?', [req.params.badge]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'User deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
