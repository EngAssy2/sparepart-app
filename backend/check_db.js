require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [cols] = await pool.query('DESCRIBE userlist');
    console.log('COLUMNS:');
    cols.forEach(c => console.log(`  ${c.Field} (${c.Type}) Null=${c.Null}`));

    const [rows] = await pool.query('SELECT * FROM userlist WHERE User_Badge = ?', ['230697']);
    if (rows[0]) {
        console.log('\nALL KEYS IN ROW:');
        Object.keys(rows[0]).forEach(k => console.log(`  "${k}"`));
    }
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
