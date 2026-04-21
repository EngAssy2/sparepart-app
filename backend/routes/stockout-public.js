const express = require('express');
const pool = require('../config/db');
const router = express.Router();

function getWorkWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

async function getNextTxnId(conn) {
    const [r] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
    return `TXN-${String(r.insertId).padStart(6, '0')}`;
}

// GET /api/public/parts/lite — no auth, for part number dropdown
router.get('/parts/lite', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT TRIM(Part_Number) as Part_Number, Part_Name, Section, Model, Quantity FROM masterdata ORDER BY Part_Number ASC'
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/public/parts/:partNumber — no auth, for part info lookup
router.get('/parts/:partNumber', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT Part_Number, SEI_Part_Number, Part_Name, Section, Model, Quantity, Location FROM masterdata WHERE TRIM(Part_Number) = ? OR TRIM(SEI_Part_Number) = ?',
            [req.params.partNumber, req.params.partNumber]
        );
        if (!rows[0]) {
            return res.status(404).json({ error: 'Part not found in system.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/public/user/:badge — lookup user by badge
router.get('/user/:badge', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT User_Badge, User_Name, User_Section FROM userlist WHERE User_Badge = ?',
            [req.params.badge]
        );
        if (!rows[0]) {
            return res.status(404).json({ error: 'Badge not found in system.' });
        }
        res.json({ User_Badge: rows[0].User_Badge, User_Name: rows[0].User_Name, User_Section: rows[0].User_Section });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/public/stock-out — process multi-item stock out (no auth)
router.post('/stock-out', async (req, res) => {
    const { badge, name, items } = req.body;

    if (!badge) {
        return res.status(400).json({ error: 'Badge number is required.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required.' });
    }

    // Verify badge exists in database
    const [userRows] = await pool.query('SELECT User_Badge, User_Name FROM userlist WHERE User_Badge = ?', [badge]);
    if (!userRows[0]) {
        return res.status(403).json({ error: 'Badge not registered in the system. Please contact admin.' });
    }
    const userName = userRows[0].User_Name;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const results = [];
        const now = new Date();
        const ww = getWorkWeek(now);

        // Validate all items first
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.Part_Number) {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${i + 1}: Part Number is required.` });
            }
            if (!item.Quantity || item.Quantity <= 0) {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${i + 1} (${item.Part_Number}): Quantity must be greater than 0.` });
            }
            if (!item.Section) {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${i + 1} (${item.Part_Number}): Section is required.` });
            }
            if (!item.Model) {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${i + 1} (${item.Part_Number}): Model is required.` });
            }
        }

        // Process all items
        for (const item of items) {
            const { Part_Number, Quantity } = item;

            const [parts] = await conn.query(
                'SELECT * FROM masterdata WHERE TRIM(Part_Number) = ? OR TRIM(SEI_Part_Number) = ?',
                [Part_Number, Part_Number]
            );
            if (!parts[0]) {
                await conn.rollback();
                return res.status(404).json({ error: `Part not found: ${Part_Number}` });
            }
            const part = parts[0];

            if (part.Quantity < parseInt(Quantity)) {
                await conn.rollback();
                return res.status(400).json({
                    error: `Insufficient stock for ${Part_Number} (${part.Part_Name}). Available: ${part.Quantity}, Requested: ${Quantity}`
                });
            }

            const txnId = await getNextTxnId(conn);
            const newQty = part.Quantity - parseInt(Quantity);

            await conn.query(
                'UPDATE masterdata SET Quantity = ?, Last_Change = ? WHERE SEI_Part_Number = ?',
                [newQty, now, part.SEI_Part_Number]
            );

            await conn.query(
                `INSERT INTO transaction_logging 
                (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [txnId, now, ww, part.Part_Number, 'Stock Out', parseInt(Quantity), badge, userName, item.Model, `Public stock out by ${item.Section}`]
            );

            results.push({ Part_Number: part.Part_Number, Part_Name: part.Part_Name, Quantity: parseInt(Quantity), newStock: newQty, txnId });
        }

        await conn.commit();
        res.json({ message: 'Stock out recorded successfully.', results });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error during stock out.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
