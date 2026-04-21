require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [rows] = await pool.query(`
        SELECT User_Badge, User_name, Authority_Level,
        CASE WHEN Password IS NULL OR Password = '' THEN 'NO_PASSWORD' ELSE 'HAS_PASSWORD' END AS pwd_status
        FROM userlist LIMIT 15
    `);
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
