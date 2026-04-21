const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
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

// GET /api/transactions
router.get('/', verifyToken, async (req, res) => {
    try {
        const { type, partNumber, search, ww, dateFrom, dateTo, userBadge, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [];
        let params = [];

        if (type) { where.push('Transaction_Type = ?'); params.push(type); }
        if (partNumber) { where.push('Part_Number LIKE ?'); params.push(`%${partNumber}%`); }
        if (search) { where.push('(Part_Number LIKE ? OR User_Name LIKE ? OR Remark LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        if (ww) { where.push('Work_Week = ?'); params.push(parseInt(ww)); }
        if (userBadge) { where.push('User_Badge = ?'); params.push(userBadge); }
        if (dateFrom) { where.push('Date_Transaction >= ?'); params.push(dateFrom); }
        if (dateTo) { where.push('Date_Transaction <= ?'); params.push(dateTo + ' 23:59:59'); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM transaction_logging ${whereClause}`, params);
        const [rows] = await pool.query(
            `SELECT * FROM transaction_logging ${whereClause} ORDER BY Date_Transaction DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        res.json({ transactions: rows, total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/transactions/stock-in
router.post('/stock-in', verifyToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { items } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Valid items array required.' });
        }

        const now = new Date();
        const ww = getWorkWeek(now);
        
        let totalProcessed = 0;

        for (const item of items) {
            const { Part_Number, Quantity, Machine_Name = '', Section = '', Model = '' } = item;
            
            if (!Part_Number || !Quantity || Quantity <= 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'Part_Number and positive Quantity required for all items.' });
            }

            // Check part exists
            const [parts] = await conn.query('SELECT * FROM masterdata WHERE Part_Number = ? OR SEI_Part_Number = ?', [Part_Number, Part_Number]);
            if (!parts[0]) { await conn.rollback(); return res.status(404).json({ error: `Part not found: ${Part_Number}` }); }
            const part = parts[0];

            const txnId = await getNextTxnId(conn);
            const newQty = part.Quantity + parseInt(Quantity);

            await conn.query(
                'UPDATE masterdata SET Quantity = ?, Last_Change = ? WHERE SEI_Part_Number = ?',
                [newQty, now, part.SEI_Part_Number]
            );

            const remark = `Section: ${Section}, Model: ${Model}`;

            await conn.query(
                `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [txnId, now, ww, part.Part_Number, 'Stock In', parseInt(Quantity), req.user.badge, req.user.name, Machine_Name, remark]
            );
            
            totalProcessed++;
        }

        await conn.commit();
        res.json({ message: 'Stock In recorded successfully.', totalProcessed });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    } finally {
        conn.release();
    }
});

// POST /api/transactions/stock-out
router.post('/stock-out', verifyToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { items } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Valid items array required.' });
        }

        const now = new Date();
        const ww = getWorkWeek(now);
        
        let totalProcessed = 0;

        for (const item of items) {
            const { Part_Number, Quantity, Machine_Name = '', Section = '', Model = '' } = item;
            
            if (!Part_Number || !Quantity || Quantity <= 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'Part_Number and positive Quantity required for all items.' });
            }

            const [parts] = await conn.query('SELECT * FROM masterdata WHERE Part_Number = ? OR SEI_Part_Number = ?', [Part_Number, Part_Number]);
            if (!parts[0]) { await conn.rollback(); return res.status(404).json({ error: `Part not found: ${Part_Number}` }); }
            const part = parts[0];

            if (part.Quantity < parseInt(Quantity)) {
                await conn.rollback();
                return res.status(400).json({ error: `Insufficient stock for ${Part_Number}. Available: ${part.Quantity}` });
            }

            const txnId = await getNextTxnId(conn);
            const newQty = part.Quantity - parseInt(Quantity);

            await conn.query(
                'UPDATE masterdata SET Quantity = ?, Last_Change = ? WHERE SEI_Part_Number = ?',
                [newQty, now, part.SEI_Part_Number]
            );

            const remark = `Section: ${Section}, Model: ${Model}`;

            await conn.query(
                `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [txnId, now, ww, part.Part_Number, 'Stock Out', parseInt(Quantity), req.user.badge, req.user.name, Machine_Name, remark]
            );
            
            totalProcessed++;
        }

        await conn.commit();
        res.json({ message: 'Stock Out recorded successfully.', totalProcessed });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
