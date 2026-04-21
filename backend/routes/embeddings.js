const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// GET /api/public/embeddings/atlas
// Returns all parts that have a visual fingerprint for local browser search
router.get('/atlas', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT SEI_Part_Number, Part_Number, Part_Name, Visual_Embedding FROM masterdata WHERE Visual_Embedding IS NOT NULL'
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching visual atlas.' });
    }
});

module.exports = router;
