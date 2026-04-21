const fs = require('fs');
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    let output = '';
    const pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [rows] = await pool.query('SHOW TABLES');
    output += JSON.stringify(rows, null, 2) + '\n';
    
    // Also, if 'orders' or 'part_order' or 'tracking' table exists, let's describe it.
    for (let row of rows) {
        const tableName = Object.values(row)[0];
        if (tableName.toLowerCase().includes('order') || tableName.toLowerCase().includes('track')) {
             const [cols] = await pool.query(`DESCRIBE \`${tableName}\``);
             output += `\nTable ${tableName}:\n`;
             output += JSON.stringify(cols, null, 2) + '\n';
        }
    }
    fs.writeFileSync('tables_out.txt', output, 'utf8');
    process.exit(0);
})();
