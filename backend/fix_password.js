require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Check real password column value
    const [rows] = await pool.query('SELECT User_Badge, User_name, Password FROM userlist');
    for (const u of rows) {
        console.log(`Badge: ${u.User_Badge} | Name: ${u.User_name} | Password type: ${typeof u.Password} | Length: ${u.Password ? u.Password.length : 0} | Starts with: ${u.Password ? u.Password.substring(0,10) : 'NULL'}`);
    }

    // Set a known test password on the Super User account (230697)
    const testHash = await bcrypt.hash('Test1234', 10);
    await pool.query('UPDATE userlist SET Password = ? WHERE User_Badge = ?', [testHash, '230697']);
    console.log('\n✅ Password set to "Test1234" for badge 230697 (Super User)');
    
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
