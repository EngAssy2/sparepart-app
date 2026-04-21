require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'C:\\uploads';

// Ensure upload dirs exist
['images', 'datasheets'].forEach(sub => {
    const dir = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://192.168.214.244:5050',
        'http://192.168.214.244'
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use('/uploads', express.static(UPLOAD_DIR));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/parts', require('./routes/parts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/files', require('./routes/files'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/procurement', require('./routes/procurement'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/public', require('./routes/stockout-public'));
app.use('/api/public/embeddings', require('./routes/embeddings'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Client IP check
app.get('/api/ip', (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7); // format IPv4 cleanly
    }
    if (clientIp === '::1') {
        clientIp = '127.0.0.1';
    }
    res.json({ ip: clientIp });
});

// --- Production: Serve React frontend ---
const clientBuildPath = path.join(__dirname, 'public');
if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));

    // SPA fallback — any route not matched above serves index.html
    app.get('*', (req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

// Start
app.listen(PORT, () => {
    console.log(`🚀 Spare Part App running at http://localhost:${PORT}`);
});
