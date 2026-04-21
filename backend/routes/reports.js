const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireLevel } = require('../middleware/auth');
const router = express.Router();

// GET /api/reports/dashboard
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        const [[{ count: totalParts }]] = await pool.query('SELECT COUNT(*) as count FROM masterdata');
        const [[{ count: lowStockCount }]] = await pool.query('SELECT COUNT(*) as count FROM masterdata WHERE Quantity <= Safety_Stock');
        const [[{ count: activeParts }]] = await pool.query("SELECT COUNT(*) as count FROM masterdata WHERE Part_Status = 'Active'");
        const [[{ count: txnToday }]] = await pool.query(
            "SELECT COUNT(*) as count FROM transaction_logging WHERE DATE(Date_Transaction) = CURDATE()"
        );
        const [[{ count: txnThisWeek }]] = await pool.query(
            "SELECT COUNT(*) as count FROM transaction_logging WHERE Work_Week = WEEK(NOW(), 3) AND YEAR(Date_Transaction) = YEAR(NOW())"
        );
        const [[{ count: txnThisMonth }]] = await pool.query(
            "SELECT COUNT(*) as count FROM transaction_logging WHERE MONTH(Date_Transaction) = MONTH(NOW()) AND YEAR(Date_Transaction) = YEAR(NOW())"
        );
        const currentWW = new Date();
        const startOfYear = new Date(currentWW.getFullYear(), 0, 1);
        const weekNo = Math.ceil(((currentWW - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

        // Last 14 days transaction trend (daily count)
        const [trendRows] = await pool.query(
            `SELECT DATE_FORMAT(Date_Transaction,'%b %d') as date, COUNT(*) as count
             FROM transaction_logging
             WHERE Date_Transaction >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
             GROUP BY DATE(Date_Transaction)
             ORDER BY DATE(Date_Transaction) ASC`
        );

        // Category breakdown (total qty per category)
        const [catRows] = await pool.query(
            `SELECT Part_Category as category, SUM(Quantity) as total
             FROM masterdata
             WHERE Part_Category IS NOT NULL AND Part_Category != ''
             GROUP BY Part_Category
             ORDER BY total DESC
             LIMIT 8`
        );

        // Low stock parts
        const [lowStockParts] = await pool.query(
            'SELECT SEI_Part_Number, Part_Name, Part_Number, Quantity, Safety_Stock, Part_Category, Location FROM masterdata WHERE Quantity <= Safety_Stock ORDER BY Quantity ASC LIMIT 20'
        );

        // Recent 10 transactions
        const [recent] = await pool.query(
            'SELECT * FROM transaction_logging ORDER BY Date_Transaction DESC LIMIT 10'
        );

        res.json({
            // Flat fields for easy consumption
            totalParts,
            lowStockCount,
            activeParts,
            txnToday,
            txnThisWeek,
            txnThisMonth,
            currentWW: weekNo,
            weeklyChart: trendRows,
            categoryBreakdown: catRows,
            lowStockParts,
            recentTransactions: recent,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/reports/low-stock
router.get('/low-stock', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM masterdata WHERE Quantity <= Safety_Stock ORDER BY (Quantity - Safety_Stock) ASC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/reports/export/parts  (CSV)
router.get('/export/parts', verifyToken, requireLevel(3), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM masterdata ORDER BY Part_Category, Part_Name');
        const headers = Object.keys(rows[0] || {});
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=parts_export.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/reports/export/transactions  (CSV)
router.get('/export/transactions', verifyToken, requireLevel(3), async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let where = '';
        let params = [];
        if (dateFrom && dateTo) {
            where = 'WHERE Date_Transaction BETWEEN ? AND ?';
            params = [dateFrom, dateTo + ' 23:59:59'];
        }
        const [rows] = await pool.query(`SELECT * FROM transaction_logging ${where} ORDER BY Date_Transaction DESC`, params);
        if (!rows.length) return res.status(404).json({ error: 'No data.' });
        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions_export.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/reports/monthly?month=4&year=2026
router.get('/monthly', verifyToken, async (req, res) => {
    try {
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Build date range for selected month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = month === 12
            ? `${year + 1}-01-01`
            : `${year}-${String(month + 1).padStart(2, '0')}-01`;

        // Previous month for comparison
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
        const prevEndDate = startDate;

        // --- Summary Stats (current month) ---
        const [[{ totalTxns }]] = await pool.query(
            `SELECT COUNT(*) as totalTxns FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?`,
            [startDate, endDate]
        );
        const [[{ totalStockIn }]] = await pool.query(
            `SELECT COALESCE(SUM(Quantity), 0) as totalStockIn FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? AND Transaction_Type = 'Stock In'`,
            [startDate, endDate]
        );
        const [[{ totalStockOut }]] = await pool.query(
            `SELECT COALESCE(SUM(Quantity), 0) as totalStockOut FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? AND Transaction_Type = 'Stock Out'`,
            [startDate, endDate]
        );
        const [[{ uniqueParts }]] = await pool.query(
            `SELECT COUNT(DISTINCT Part_Number) as uniqueParts FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?`,
            [startDate, endDate]
        );

        // --- Previous month stats for comparison ---
        const [[{ prevTotalTxns }]] = await pool.query(
            `SELECT COUNT(*) as prevTotalTxns FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?`,
            [prevStartDate, prevEndDate]
        );
        const [[{ prevTotalStockIn }]] = await pool.query(
            `SELECT COALESCE(SUM(Quantity), 0) as prevTotalStockIn FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? AND Transaction_Type = 'Stock In'`,
            [prevStartDate, prevEndDate]
        );
        const [[{ prevTotalStockOut }]] = await pool.query(
            `SELECT COALESCE(SUM(Quantity), 0) as prevTotalStockOut FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? AND Transaction_Type = 'Stock Out'`,
            [prevStartDate, prevEndDate]
        );
        const [[{ prevUniqueParts }]] = await pool.query(
            `SELECT COUNT(DISTINCT Part_Number) as prevUniqueParts FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?`,
            [prevStartDate, prevEndDate]
        );

        // --- Daily transaction trend ---
        const [dailyTrend] = await pool.query(
            `SELECT DAY(Date_Transaction) as day, DATE_FORMAT(Date_Transaction, '%b %d') as label, COUNT(*) as count
             FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?
             GROUP BY DAY(Date_Transaction), DATE_FORMAT(Date_Transaction, '%b %d')
             ORDER BY DAY(Date_Transaction) ASC`,
            [startDate, endDate]
        );

        // --- Stock In vs Stock Out daily comparison ---
        const [stockInOutDaily] = await pool.query(
            `SELECT DAY(Date_Transaction) as day, DATE_FORMAT(Date_Transaction, '%b %d') as label,
                    SUM(CASE WHEN Transaction_Type = 'Stock In' THEN Quantity ELSE 0 END) as stockIn,
                    SUM(CASE WHEN Transaction_Type = 'Stock Out' THEN Quantity ELSE 0 END) as stockOut
             FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?
             GROUP BY DAY(Date_Transaction), DATE_FORMAT(Date_Transaction, '%b %d')
             ORDER BY DAY(Date_Transaction) ASC`,
            [startDate, endDate]
        );

        // --- Top 10 Most Consumed Parts (Stock Out) ---
        const [topConsumed] = await pool.query(
            `SELECT t.Part_Number, COALESCE(m.Part_Name, '—') as Part_Name, COALESCE(m.Part_Category, '—') as Part_Category,
                    SUM(t.Quantity) as totalQty, COUNT(*) as txnCount
             FROM transaction_logging t LEFT JOIN masterdata m ON t.Part_Number = m.Part_Number
             WHERE t.Date_Transaction >= ? AND t.Date_Transaction < ? AND t.Transaction_Type = 'Stock Out'
             GROUP BY t.Part_Number ORDER BY totalQty DESC LIMIT 10`,
            [startDate, endDate]
        );

        // --- Top 10 Most Restocked Parts (Stock In) ---
        const [topRestocked] = await pool.query(
            `SELECT t.Part_Number, COALESCE(m.Part_Name, '—') as Part_Name, COALESCE(m.Part_Category, '—') as Part_Category,
                    SUM(t.Quantity) as totalQty, COUNT(*) as txnCount
             FROM transaction_logging t LEFT JOIN masterdata m ON t.Part_Number = m.Part_Number
             WHERE t.Date_Transaction >= ? AND t.Date_Transaction < ? AND t.Transaction_Type = 'Stock In'
             GROUP BY t.Part_Number ORDER BY totalQty DESC LIMIT 10`,
            [startDate, endDate]
        );

        // --- Transactions by User ---
        const [userActivity] = await pool.query(
            `SELECT User_Badge, User_Name, COUNT(*) as txnCount,
                    SUM(CASE WHEN Transaction_Type = 'Stock In' THEN Quantity ELSE 0 END) as totalIn,
                    SUM(CASE WHEN Transaction_Type = 'Stock Out' THEN Quantity ELSE 0 END) as totalOut
             FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ?
             GROUP BY User_Badge, User_Name ORDER BY txnCount DESC`,
            [startDate, endDate]
        );

        // --- Procurement Activity ---
        let procurementSummary = { prCount: 0, poCount: 0, prByStatus: [], poByStatus: [] };
        try {
            const [[{ prCount }]] = await pool.query(
                `SELECT COUNT(*) as prCount FROM purchase_requests WHERE Request_Date >= ? AND Request_Date < ?`,
                [startDate, endDate]
            );
            const [[{ poCount }]] = await pool.query(
                `SELECT COUNT(*) as poCount FROM purchase_orders WHERE Order_Date >= ? AND Order_Date < ?`,
                [startDate, endDate]
            );
            const [prByStatus] = await pool.query(
                `SELECT Status, COUNT(*) as count FROM purchase_requests WHERE Request_Date >= ? AND Request_Date < ? GROUP BY Status`,
                [startDate, endDate]
            );
            const [poByStatus] = await pool.query(
                `SELECT Status, COUNT(*) as count FROM purchase_orders WHERE Order_Date >= ? AND Order_Date < ? GROUP BY Status`,
                [startDate, endDate]
            );
            procurementSummary = { prCount, poCount, prByStatus, poByStatus };
        } catch (e) {
            // procurement tables might not exist – ignore
        }

        // --- Low Stock Snapshot ---
        const [lowStockParts] = await pool.query(
            `SELECT SEI_Part_Number, Part_Name, Part_Number, Quantity, Safety_Stock, Part_Category, Location, Priority_Level, Supplier
             FROM masterdata WHERE Quantity <= Safety_Stock ORDER BY (Quantity - Safety_Stock) ASC LIMIT 20`
        );

        // --- Full Transaction List ---
        const [transactions] = await pool.query(
            `SELECT * FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? ORDER BY Date_Transaction DESC`,
            [startDate, endDate]
        );

        res.json({
            month, year,
            summary: {
                totalTxns, totalStockIn, totalStockOut,
                netChange: totalStockIn - totalStockOut,
                uniqueParts,
            },
            prevSummary: {
                totalTxns: prevTotalTxns, totalStockIn: prevTotalStockIn, totalStockOut: prevTotalStockOut,
                netChange: prevTotalStockIn - prevTotalStockOut,
                uniqueParts: prevUniqueParts,
            },
            dailyTrend,
            stockInOutDaily,
            topConsumed,
            topRestocked,
            userActivity,
            procurementSummary,
            lowStockParts,
            transactions,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/reports/export/monthly?month=4&year=2026 (CSV)
router.get('/export/monthly', verifyToken, requireLevel(3), async (req, res) => {
    try {
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = month === 12
            ? `${year + 1}-01-01`
            : `${year}-${String(month + 1).padStart(2, '0')}-01`;

        const [rows] = await pool.query(
            `SELECT * FROM transaction_logging WHERE Date_Transaction >= ? AND Date_Transaction < ? ORDER BY Date_Transaction DESC`,
            [startDate, endDate]
        );
        if (!rows.length) return res.status(404).json({ error: 'No data for this month.' });
        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=monthly_report_${year}_${String(month).padStart(2, '0')}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
