const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'D:\Program Inventory\Test Software\DataBase';

// Ensure directories exist
['image', 'Data Sheet', 'Quotation'].forEach(sub => {
    const dir = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const isPdf = file.mimetype === 'application/pdf';
        cb(null, path.join(UPLOAD_DIR, isPdf ? 'Data Sheet' : 'image'));
    },
    filename: (req, file, cb) => {
        const seiPartNumber = req.body.SEI_Part_Number;
        
        if (seiPartNumber) {
            const isPdf = file.mimetype === 'application/pdf';
            const safePartNumber = seiPartNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
            cb(null, `${safePartNumber}${isPdf ? '.pdf' : '.png'}`);
        } else {
            const ext = path.extname(file.originalname);
            const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
            cb(null, `${base}_${Date.now()}${ext}`);
        }
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only images (jpg, png, webp) and PDF files are allowed.'));
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

// POST /api/files/upload
router.post('/upload', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const isPdf = req.file.mimetype === 'application/pdf';
    const sub = isPdf ? 'Data Sheet' : 'image';
    const filePath = `/DataBase/${sub}/${req.file.filename}`;
    res.json({ path: filePath, filename: req.file.filename, originalname: req.file.originalname });
});

// GET /api/files/images/:filename  (serve files via API)
router.get('/images/:filename', (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, 'image', safeFilename + '.png');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
    res.sendFile(path.resolve(filePath));
});

router.get('/DataSheets/:filename', (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, 'Data Sheet', safeFilename + '.pdf');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
    res.sendFile(path.resolve(filePath));
});

const quotationStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, 'Quotation')),
    filename: (req, file, cb) => {
        const prNum = req.body.prNumber || 'unknown_pr';
        cb(null, `${prNum}.pdf`);
    }
});
const uploadQuotation = multer({ 
    storage: quotationStorage, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files allowed for quotation.'));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
});

router.post('/quotation', verifyToken, uploadQuotation.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No quotation file uploaded.' });
    res.json({ message: 'Quotation uploaded successfully.' });
});

router.get('/quotations/:filename', (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, 'Quotation', safeFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Quotation not found.' });
    res.sendFile(path.resolve(filePath));
});

module.exports = router;
