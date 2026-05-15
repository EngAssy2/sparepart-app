const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireLevel } = require('../middleware/auth');
const router = express.Router();

// Helper: get next SEI_Part_Number
async function getNextPartNumber(conn) {
    const [result] = await conn.query(
        'INSERT INTO auto_part_number_seq () VALUES ()'
    );
    const id = result.insertId;
    return `SEI-${String(id).padStart(5, '0')}`;
}

function calculateDerivedFields(body, existingData = {}) {
    let Quantity = Number(body.Quantity !== undefined ? body.Quantity : (existingData.Quantity || 0));
    let Quantity_Use_Each_Machine = Number(body.Quantity_Use_Each_Machine !== undefined ? body.Quantity_Use_Each_Machine : (existingData.Quantity_Use_Each_Machine || 0));
    let Total_Machine = Number(body.Total_Machine !== undefined ? body.Total_Machine : (existingData.Total_Machine || 0));
    let Part_Criteria = body.Part_Criteria !== undefined ? body.Part_Criteria : (existingData.Part_Criteria || '');

    let Safety_Stock = Number(body.Safety_Stock !== undefined ? body.Safety_Stock : (existingData.Safety_Stock || 0));
    let Part_Status = body.Part_Status !== undefined ? body.Part_Status : (existingData.Part_Status || 'Active');
    let Part_Category = body.Part_Category !== undefined ? body.Part_Category : (existingData.Part_Category || '');
    let Request_Reason = body.Request_Reason !== undefined ? body.Request_Reason : (existingData.Request_Reason || '');
    let Priority_Level = body.Priority_Level !== undefined ? body.Priority_Level : (existingData.Priority_Level || 'Normal');

    if (Quantity > 0 || Quantity_Use_Each_Machine > 0 || Total_Machine > 0) {
        Safety_Stock = Quantity_Use_Each_Machine * Total_Machine;
    }

    if (Quantity === 0) {
        Part_Status = 'URGENT PART';
    } else if (Quantity <= Safety_Stock) {
        Part_Status = 'ORDER PART';
    } else if (Quantity > Safety_Stock) {
        Part_Status = 'STOCK ENOUGH';
    }

    if (Part_Criteria === 'REPLACEMENT PART' || Part_Criteria === 'CONSUMABLE PART') {
        Part_Category = 'CRITICAL PART';
    } else {
        Part_Category = 'NO CRITICAL PART';
    }

    if (Quantity >= Safety_Stock && Safety_Stock <= Quantity) {
        Request_Reason = 'STOCK ENOUGH';
    } else if (Quantity === 0 && Quantity < Safety_Stock) {
        Request_Reason = 'NO SPARE';
    } else {
        Request_Reason = 'MINIMAL STOCK';
    }

    if (Request_Reason === 'STOCK ENOUGH' && Part_Status === 'STOCK ENOUGH') {
        Priority_Level = 'No Request';
    } else if (Part_Status === 'ORDER PART' && Part_Category === 'NO CRITICAL PART' && Part_Criteria === 'REPLACEMENT PART') {
        Priority_Level = '2nd Priority';
    } else if (Part_Status === 'ORDER PART' && Part_Category === 'NO CRITICAL PART' && Part_Criteria === 'INSURANCE PART') {
        Priority_Level = '2nd Priority';
    } else if (Part_Status === 'ORDER PART' && Part_Category === 'NO CRITICAL PART' && Part_Criteria === 'CONSUMABLE PART') {
        Priority_Level = '2nd Priority';
    } else {
        Priority_Level = '1st Priority';
    }

    return {
        Quantity, Quantity_Use_Each_Machine, Total_Machine, Safety_Stock,
        Part_Status, Part_Criteria, Part_Category, Request_Reason, Priority_Level
    };
}

// GET /api/parts
router.get('/', verifyToken, async (req, res) => {
    try {
        const { search, category, model, section, status, priority, stock, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [];
        let params = [];

        if (search) {
            where.push('(Part_Number LIKE ? OR Part_Name LIKE ? OR SEI_Part_Number LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (category) { where.push('Part_Category = ?'); params.push(category); }
        if (model) { where.push('Model = ?'); params.push(model); }
        if (section) { where.push('Section = ?'); params.push(section); }
        if (status) { where.push('Part_Status = ?'); params.push(status); }
        if (priority) { where.push('Priority_Level = ?'); params.push(priority); }
        if (stock === 'low') { where.push('Quantity <= Safety_Stock AND Safety_Stock > 0'); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total FROM masterdata ${whereClause}`, params
        );
        const total = countRows[0].total;

        const [rows] = await pool.query(
            `SELECT * FROM masterdata ${whereClause} ORDER BY Created_On DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/parts/meta - distinct dropdown values
router.get('/meta', verifyToken, async (req, res) => {
    try {
        const fields = ['Part_Category', 'Part_Status', 'Part_Criteria', 'Section', 'Priority_Level', 'Brand', 'Supplier', 'Model'];
        const result = {};
        await Promise.all(fields.map(async (f) => {
            const [rows] = await pool.query(`SELECT DISTINCT \`${f}\` as val FROM masterdata WHERE \`${f}\` != '' ORDER BY \`${f}\``);
            result[f] = rows.map(r => r.val);
        }));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/parts/lite - ultrafast lookup for dropdowns
router.get('/lite', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT TRIM(Part_Number) as Part_Number, Part_Name, Quantity FROM masterdata ORDER BY Part_Number ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/parts/check/duplicate
router.get('/check/duplicate', verifyToken, async (req, res) => {
    try {
        const { partNumber, excludeId } = req.query;
        if (!partNumber) return res.json({ isDuplicate: false });
        let q = 'SELECT SEI_Part_Number FROM masterdata WHERE TRIM(Part_Number) = ?';
        let p = [partNumber];
        if (excludeId) {
            q += ' AND SEI_Part_Number != ?';
            p.push(excludeId);
        }
        const [rows] = await pool.query(q, p);
        res.json({ isDuplicate: rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/parts/:seiPartNumber
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM masterdata WHERE TRIM(SEI_Part_Number) = ?',
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Part not found.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/parts - Register new part (Admin and above)
router.post('/', verifyToken, requireLevel(2), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const seiPartNumber = await getNextPartNumber(conn);
        const now = new Date();
        const {
            Part_Number: _partNumber, Part_Name: _partName,
            Model = '', Brand = '', Supplier = '', Section = '',
            Location = '',
            Image_Path = null, Datasheet_Path = null,
            Visual_Embedding = null,
            Remark = ''
        } = req.body;

        // Explicit per-field trim as double protection
        const Part_Number = typeof _partNumber === 'string' ? _partNumber.trim() : _partNumber;
        const Part_Name   = typeof _partName   === 'string' ? _partName.trim()   : _partName;

        const Item_Description = Remark !== undefined ? Remark : (req.body.Item_Description || '');
        //console.log(`[DEBUG] Registering part. Remark: "${Remark}", Final Item_Description: "${Item_Description}"`);

        const derived = calculateDerivedFields(req.body);

        if (Part_Number) {
            const [dup] = await conn.query('SELECT SEI_Part_Number FROM masterdata WHERE Part_Number = ?', [Part_Number]);
            if (dup.length > 0) {
                await conn.rollback();
                return res.status(409).json({ message: 'Part Number already exists in the system.' });
            }
        }

        await conn.query(
            `INSERT INTO masterdata 
       (SEI_Part_Number, Part_Number, Part_Name, Quantity, Quantity_Use_Each_Machine, 
        Total_Machine, Safety_Stock, Part_Status, Part_Criteria, Part_Category, 
        Model, Brand, Supplier, Section, Request_Reason, Priority_Level, 
        Item_Description, Location, Visual_Embedding, Last_Change, Created_On)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [seiPartNumber, Part_Number, Part_Name, derived.Quantity, derived.Quantity_Use_Each_Machine,
                derived.Total_Machine, derived.Safety_Stock, derived.Part_Status, derived.Part_Criteria, derived.Part_Category,
                Model, Brand, Supplier, Section, derived.Request_Reason, derived.Priority_Level,
                Item_Description, Location, Visual_Embedding, now, now]
        );

        // Log registration in transaction_logging
        const [seqResult] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
        const txnId = `TXN-${String(seqResult.insertId).padStart(6, '0')}`;
        const ww = getWorkWeek(now);
        const txnRemark = Remark ? `Register new part: ${Part_Name} (${Remark})` : `Register new part: ${Part_Name}`;
        await conn.query(
            `INSERT INTO transaction_logging 
       (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [txnId, now, ww, Part_Number, 'Register', derived.Quantity, req.user.badge, req.user.name, '', txnRemark]
        );

        // Fetch back the actual SEI_Part_Number generated/overwritten by the database trigger
        const [realSeiRows] = await conn.query('SELECT SEI_Part_Number FROM masterdata WHERE Part_Number = ?', [Part_Number]);
        const finalSeiPartNumber = (realSeiRows.length > 0 && realSeiRows[0].SEI_Part_Number) ? realSeiRows[0].SEI_Part_Number : seiPartNumber;

        await conn.commit();
        res.status(201).json({ message: 'Part registered.', SEI_Part_Number: finalSeiPartNumber });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    } finally {
        conn.release();
    }
});

// PUT /api/parts/:id - Modify part (Admin and above)
router.put('/:id', verifyToken, requireLevel(2), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const now = new Date();
        const [existing] = await conn.query('SELECT * FROM masterdata WHERE SEI_Part_Number = ?', [req.params.id]);
        if (!existing[0]) { await conn.rollback(); return res.status(404).json({ error: 'Part not found.' }); }

        const {
            Part_Number: _pn = existing[0].Part_Number,
            Part_Name: _pname = existing[0].Part_Name,
            Model = existing[0].Model, Brand = existing[0].Brand, Supplier = existing[0].Supplier, Section = existing[0].Section,
            Location = existing[0].Location,
            Image_Path = existing[0].Image_Path, Datasheet_Path = existing[0].Datasheet_Path,
            Visual_Embedding = existing[0].Visual_Embedding, Remark
        } = req.body;

        // Explicit per-field trim as double protection
        const Part_Number = typeof _pn    === 'string' ? _pn.trim()    : _pn;
        const Part_Name   = typeof _pname === 'string' ? _pname.trim() : _pname;

        const Item_Description = Remark !== undefined ? Remark : (req.body.Item_Description || existing[0].Item_Description || '');
        console.log(`[DEBUG] Updating part ${req.params.id}. Remark: "${Remark}", Final Item_Description: "${Item_Description}"`);

        const derived = calculateDerivedFields(req.body, existing[0]);

        if (Part_Number && Part_Number !== existing[0].Part_Number) {
            const [dup] = await conn.query('SELECT SEI_Part_Number FROM masterdata WHERE Part_Number = ? AND SEI_Part_Number != ?', [Part_Number, req.params.id]);
            if (dup.length > 0) {
                await conn.rollback();
                return res.status(409).json({ message: 'Part Number already exists in another part.' });
            }
        }

        await conn.query(
            `UPDATE masterdata SET 
       Part_Number=?, Part_Name=?, Quantity=?, Quantity_Use_Each_Machine=?,
       Total_Machine=?, Safety_Stock=?, Part_Status=?, Part_Criteria=?,
       Part_Category=?, Model=?, Brand=?, Supplier=?, Section=?,
       Request_Reason=?, Priority_Level=?, Item_Description=?, Location=?,
       Visual_Embedding=?, Last_Change=?
       WHERE SEI_Part_Number=?`,
            [Part_Number, Part_Name, derived.Quantity, derived.Quantity_Use_Each_Machine,
                derived.Total_Machine, derived.Safety_Stock, derived.Part_Status, derived.Part_Criteria,
                derived.Part_Category, Model, Brand, Supplier, Section,
                derived.Request_Reason, derived.Priority_Level, Item_Description, Location,
                Visual_Embedding, now, req.params.id]
        );

        // Log modification
        const [seqResult] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
        const txnId = `TXN-${String(seqResult.insertId).padStart(6, '0')}`;
        const ww = getWorkWeek(now);
        const partName = Part_Name || existing[0].Part_Name;
        const remarkSuffix = Remark ? ` (${Remark})` : '';

        await conn.query(
            `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [txnId, now, ww, Part_Number || existing[0].Part_Number, 'modify', 0, req.user.badge, req.user.name, '', `Modified part: ${partName}${remarkSuffix}`]
        );

        await conn.commit();
        res.json({ message: 'Part updated.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    } finally {
        conn.release();
    }
});

// BATCH DELETE /api/parts/batch (Admin and above)
router.delete('/batch', verifyToken, requireLevel(2), async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No IDs provided for deletion.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const now = new Date();
        const ww = getWorkWeek(now);

        for (const id of ids) {
            const [existing] = await conn.query('SELECT * FROM masterdata WHERE SEI_Part_Number = ?', [id]);
            if (existing[0]) {
                await conn.query('DELETE FROM masterdata WHERE SEI_Part_Number = ?', [id]);

                // Log deletion
                const [seqResult] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
                const txnId = `TXN-${String(seqResult.insertId).padStart(6, '0')}`;
                await conn.query(
                    `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
                    [txnId, now, ww, existing[0].Part_Number, 'delete', 0, req.user.badge, req.user.name, '', `Batch Deleted part: ${existing[0].Part_Name}`]
                );
            }
        }

        await conn.commit();
        res.json({ message: `${ids.length} parts deleted successfully.` });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error during batch deletion.' });
    } finally {
        conn.release();
    }
});

// DELETE /api/parts/:id (Admin and above)
router.delete('/:id', verifyToken, requireLevel(2), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [existing] = await conn.query('SELECT * FROM masterdata WHERE SEI_Part_Number = ?', [req.params.id]);
        if (!existing[0]) { await conn.rollback(); return res.status(404).json({ error: 'Part not found.' }); }

        await conn.query('DELETE FROM masterdata WHERE SEI_Part_Number = ?', [req.params.id]);

        // Log deletion
        const [seqResult] = await conn.query('INSERT INTO auto_transaction_seq () VALUES ()');
        const txnId = `TXN-${String(seqResult.insertId).padStart(6, '0')}`;
        const now = new Date();
        const ww = getWorkWeek(now);
        await conn.query(
            `INSERT INTO transaction_logging (SEI_Transacion_ID, Date_Transaction, Work_Week, Part_Number, Transaction_Type, Quantity, User_Badge, User_Name, Machine_Name, Remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [txnId, now, ww, existing[0].Part_Number, 'delete', 0, req.user.badge, req.user.name, '', `Deleted part: ${existing[0].Part_Name}`]
        );

        await conn.commit();
        res.json({ message: 'Part deleted.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    } finally {
        conn.release();
    }
});

function getWorkWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

module.exports = router;
