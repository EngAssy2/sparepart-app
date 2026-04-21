const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
    try {
        const notifications = [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30); // Use 30 days for testing and broader visibility
        
        // 1. Low Stock Alerts (For All Users)
        const [lowStockParts] = await pool.query(
            'SELECT Part_Number, Part_Name, Quantity, Safety_Stock FROM masterdata WHERE Quantity <= Safety_Stock AND Safety_Stock > 0'
        );
        
        lowStockParts.forEach(part => {
            notifications.push({
                id: `stock-${part.Part_Number}`,
                type: 'low_stock',
                title: 'Low Stock Alert',
                message: `Part ${part.Part_Number} (${part.Part_Name}) is low on stock (${part.Quantity}/${part.Safety_Stock}).`,
                link: `/parts/${part.Part_Number}`,
                timestamp: new Date().toISOString() // Doesn't have a specific event timestamp
            });
        });

        // 2. PRs Needing Approval (Only for Level 1 or 2 Admins)
        if (req.user.level <= 2) {
            const [pendingPRs] = await pool.query(
                `SELECT PR_Number, Requester_Name, Request_Date 
                 FROM purchase_requests 
                 WHERE Status = 'Pending Review'`
            );
            
            pendingPRs.forEach(pr => {
                notifications.push({
                    id: `pr-pending-${pr.PR_Number}`,
                    type: 'pr_approval',
                    title: 'PR Needs Approval',
                    message: `${pr.Requester_Name} requested PR ${pr.PR_Number}.`,
                    link: '/procurement/pr',
                    timestamp: pr.Request_Date
                });
            });
        }

        // 3. PR Status Updates for Current User (Last 30 days)
        const [updatedPRs] = await pool.query(
            `SELECT PR_Number, Status, Request_Date 
             FROM purchase_requests 
             WHERE Requester_Badge = ? 
             AND Status IN ('Approved', 'Rejected', 'Cancelled')
             AND Request_Date >= ?`,
            [req.user.badge, thirtyDaysAgo]
        );
        
        updatedPRs.forEach(pr => {
            notifications.push({
                id: `pr-update-${pr.PR_Number}-${pr.Status}`,
                type: 'pr_update',
                title: `PR ${pr.Status}`,
                message: `Your Purchase Request ${pr.PR_Number} was ${pr.Status.toLowerCase()}.`,
                link: '/procurement/pr',
                timestamp: pr.Request_Date // Typically would be an updated_at field, defaulting to Request_Date
            });
        });

        // Sort notifications by timestamp (newest first)
        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ data: notifications });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
