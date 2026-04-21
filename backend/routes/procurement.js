const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireLevel } = require('../middleware/auth');
const router = express.Router();

// Helper to get next sequence ID (Deprecating for manual doc inputs)
async function getNextDocId(conn, docType) {
    // Deprecated
    return null;
}

// ---------------------------------------------------------
// PURCHASE REQUESTS (PR)
// ---------------------------------------------------------

router.get('/pr', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM purchase_requests ORDER BY Request_Date DESC'
        );
        res.json({ data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/pr/:id', verifyToken, async (req, res) => {
    try {
        const [pr] = await pool.query('SELECT * FROM purchase_requests WHERE PR_Number = ?', [req.params.id]);
        if (!pr[0]) return res.status(404).json({ error: 'PR not found' });

        const [items] = await pool.query('SELECT p.*, m.Part_Name FROM purchase_request_items p LEFT JOIN masterdata m ON p.Part_Number = m.Part_Number WHERE p.PR_Number = ?', [req.params.id]);
        res.json({ ...pr[0], items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/pr', verifyToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const now = new Date();
        const { PR_Number, Remarks, items } = req.body; // items: [{Part_Number, Quantity, Reason}]

        if (!PR_Number) {
            await conn.rollback();
            return res.status(400).json({ error: 'PR Number is required.' });
        }

        const [existing] = await conn.query('SELECT PR_Number FROM purchase_requests WHERE PR_Number = ?', [PR_Number]);
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({ error: `PR Number "${PR_Number}" already exists.` });
        }

        await conn.query(
            'INSERT INTO purchase_requests (PR_Number, Request_Date, Requester_Badge, Requester_Name, Remarks) VALUES (?,?,?,?,?)',
            [PR_Number, now, req.user.badge, req.user.name, Remarks || '']
        );

        if (items && items.length > 0) {
            const partNumbers = items.map(i => i.Part_Number);
            const [masterdataParts] = await conn.query(
                'SELECT Part_Number FROM masterdata WHERE Part_Number IN (?)',
                [partNumbers]
            );

            const validSet = new Set(masterdataParts.map(p => p.Part_Number));
            const invalidParts = partNumbers.filter(pn => !validSet.has(pn));

            if (invalidParts.length > 0) {
                await conn.rollback();
                return res.status(400).json({ error: `The following part numbers do not exist in the database: ${invalidParts.join(', ')}` });
            }

            for (let item of items) {
                await conn.query(
                    'INSERT INTO purchase_request_items (PR_Number, Part_Number, Quantity, Reason) VALUES (?,?,?,?)',
                    [PR_Number, item.Part_Number, item.Quantity, item.Reason || '']
                );
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'PR created.', PR_Number: PR_Number });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        conn.release();
    }
});

router.put('/pr/:id/status', verifyToken, async (req, res) => {
    try {
        const { Status } = req.body;

        if (req.user.level > 2) {
            if (Status !== 'Cancelled') return res.status(403).json({ error: 'Forbidden' });

            const [pr] = await pool.query('SELECT Requester_Badge FROM purchase_requests WHERE PR_Number = ?', [req.params.id]);
            if (!pr[0] || pr[0].Requester_Badge !== req.user.badge) return res.status(403).json({ error: 'Forbidden' });
        }

        await pool.query('UPDATE purchase_requests SET Status = ? WHERE PR_Number = ?', [Status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ---------------------------------------------------------
// PURCHASE ORDERS (PO)
// ---------------------------------------------------------

router.get('/po', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM purchase_orders ORDER BY Order_Date DESC');
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/po/:id', verifyToken, async (req, res) => {
    try {
        const [po] = await pool.query('SELECT * FROM purchase_orders WHERE PO_Number = ?', [req.params.id]);
        if (!po[0]) return res.status(404).json({ error: 'PO not found' });

        const [items] = await pool.query('SELECT p.*, m.Part_Name FROM purchase_order_items p LEFT JOIN masterdata m ON p.Part_Number = m.Part_Number WHERE p.PO_Number = ?', [req.params.id]);
        res.json({ ...po[0], items });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/po', verifyToken, requireLevel(2), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const now = new Date();
        const { PO_Number, Expected_Delivery, Supplier, Remarks, items, PR_Number } = req.body;
        // items: [{Part_Number, Quantity, Unit_Price, PR_Item_ID}]

        if (!PO_Number) {
            await conn.rollback();
            return res.status(400).json({ error: 'PO Number is required.' });
        }

        const [existing] = await conn.query('SELECT PO_Number FROM purchase_orders WHERE PO_Number = ?', [PO_Number]);
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({ error: `PO Number "${PO_Number}" already exists.` });
        }

        await conn.query(
            'INSERT INTO purchase_orders (PO_Number, Order_Date, Expected_Delivery, Supplier, Created_By, Remarks) VALUES (?,?,?,?,?,?)',
            [PO_Number, now, Expected_Delivery || null, Supplier || '', req.user.name, Remarks || '']
        );

        if (items && items.length > 0) {
            for (let item of items) {
                await conn.query(
                    'INSERT INTO purchase_order_items (PO_Number, PR_Item_ID, Part_Number, Quantity_Ordered, Unit_Price) VALUES (?,?,?,?,?)',
                    [PO_Number, item.PR_Item_ID || null, item.Part_Number, item.Quantity, item.Unit_Price || 0]
                );
            }
        }

        if (PR_Number) {
            await conn.query("UPDATE purchase_requests SET Status = 'PO Created' WHERE PR_Number = ?", [PR_Number]);
        }

        await conn.commit();
        res.status(201).json({ message: 'PO created.', PO_Number: PO_Number });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        conn.release();
    }
});

router.put('/po/:id/status', verifyToken, requireLevel(2), async (req, res) => {
    try {
        const { Status } = req.body;
        await pool.query('UPDATE purchase_orders SET Status = ? WHERE PO_Number = ?', [Status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ---------------------------------------------------------
// DELIVERY ORDERS (DO)
// ---------------------------------------------------------

router.get('/do', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM delivery_orders ORDER BY Delivery_Date DESC');
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/do/:id', verifyToken, async (req, res) => {
    try {
        const [del_order] = await pool.query('SELECT * FROM delivery_orders WHERE DO_Number = ?', [req.params.id]);
        if (!del_order[0]) return res.status(404).json({ error: 'DO not found' });

        const [items] = await pool.query('SELECT d.*, m.Part_Name FROM delivery_order_items d LEFT JOIN masterdata m ON d.Part_Number = m.Part_Number WHERE d.DO_Number = ?', [req.params.id]);
        res.json({ ...del_order[0], items });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

function getWorkWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Create DO and RECEIVE items into masterdata
router.post('/do', verifyToken, requireLevel(3), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const now = new Date();
        const { DO_Number, PO_Number, Supplier_DO_Ref, Remarks, items } = req.body;
        // items: [{PO_Item_ID, Part_Number, Quantity_Delivered, Condition_Status}]

        if (!DO_Number) {
            await conn.rollback();
            return res.status(400).json({ error: 'DO Number is required.' });
        }

        const [existing] = await conn.query('SELECT DO_Number FROM delivery_orders WHERE DO_Number = ?', [DO_Number]);
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({ error: `DO Number "${DO_Number}" already exists.` });
        }

        await conn.query(
            'INSERT INTO delivery_orders (DO_Number, PO_Number, Delivery_Date, Receiver_Badge, Receiver_Name, Supplier_DO_Ref, Remarks, Status) VALUES (?,?,?,?,?,?,?,?)',
            [DO_Number, PO_Number, now, req.user.badge, req.user.name, Supplier_DO_Ref || '', Remarks || '', 'Verified']
        );

        for (let item of items) {
            await conn.query(
                'INSERT INTO delivery_order_items (DO_Number, PO_Item_ID, Part_Number, Quantity_Delivered, Condition_Status) VALUES (?,?,?,?,?)',
                [DO_Number, item.PO_Item_ID, item.Part_Number, item.Quantity_Delivered, item.Condition_Status || 'Good']
            );

            // Increment PO received quantity
            await conn.query(
                'UPDATE purchase_order_items SET Quantity_Received = Quantity_Received + ? WHERE id = ?',
                [item.Quantity_Delivered, item.PO_Item_ID]
            );

            // Stock In masterdata logic
            await conn.query(
                'UPDATE masterdata SET Quantity = Quantity + ?, Last_Change = ? WHERE Part_Number = ?',
                [item.Quantity_Delivered, now, item.Part_Number]
            );

            // Transaction logging logic
            const [seqResult] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
            const txnId = `TXN-${String(seqResult.insertId).padStart(6, '0')}`;
            const ww = getWorkWeek(now);
            await conn.query(
                `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [txnId, now, ww, item.Part_Number, 'Stock In', item.Quantity_Delivered, req.user.badge, req.user.name, '', `DO Received: ${DO_Number} (PO: ${PO_Number})`]
            );
        }

        // Auto-close PO if fully received (simplistic logic: check if any PO_Item quantity_received < quantity_ordered)
        const [po_items] = await conn.query('SELECT Quantity_Ordered, Quantity_Received FROM purchase_order_items WHERE PO_Number = ?', [PO_Number]);
        const allReceived = po_items.every(i => i.Quantity_Received >= i.Quantity_Ordered);
        const autoStatus = allReceived ? 'Closed' : 'Partially Delivered';
        await conn.query('UPDATE purchase_orders SET Status = ? WHERE PO_Number = ?', [autoStatus, PO_Number]);

        await conn.commit();
        res.status(201).json({ message: 'DO recorded and parts stocked in.', DO_Number: DO_Number });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        conn.release();
    }
});

module.exports = router;
