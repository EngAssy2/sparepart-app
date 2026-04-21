require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [rows] = await pool.query('SHOW TABLES');
    console.log(JSON.stringify(rows, null, 2));
    
    // Also, if 'orders' or 'part_order' or 'tracking' table exists, let's describe it.
    for (let row of rows) {
        const tableName = Object.values(row)[0];
        if (tableName.toLowerCase().includes('order') || tableName.toLowerCase().includes('track')) {
             const [cols] = await pool.query(`DESCRIBE \`${tableName}\``);
             console.log(`\nTable ${tableName}:`);
             console.log(JSON.stringify(cols, null, 2));
        }
    }
    process.exit(0);
})();
