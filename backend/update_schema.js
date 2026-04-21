require('dotenv').config();
const mysql = require('mysql2/promise');

const schema = `
CREATE TABLE IF NOT EXISTS auto_procurement_seq (
    id INT NOT NULL AUTO_INCREMENT,
    doc_type ENUM('PR','PO','DO') NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS purchase_requests (
    PR_Number VARCHAR(20) PRIMARY KEY,
    Request_Date DATETIME NOT NULL,
    Requester_Badge VARCHAR(50) NOT NULL,
    Requester_Name VARCHAR(100),
    Status ENUM('Pending Review', 'Approved', 'Rejected', 'PO Created', 'Cancelled') DEFAULT 'Pending Review',
    Remarks TEXT
);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    PR_Number VARCHAR(20) NOT NULL,
    Part_Number VARCHAR(50) NOT NULL,
    Quantity INT NOT NULL,
    Reason TEXT,
    FOREIGN KEY (PR_Number) REFERENCES purchase_requests(PR_Number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    PO_Number VARCHAR(20) PRIMARY KEY,
    Order_Date DATETIME NOT NULL,
    Expected_Delivery DATE,
    Supplier VARCHAR(100),
    Status ENUM('Pending', 'Sent', 'Partially Delivered', 'Closed', 'Cancelled') DEFAULT 'Pending',
    Created_By VARCHAR(50),
    Remarks TEXT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    PO_Number VARCHAR(20) NOT NULL,
    PR_Item_ID INT,
    Part_Number VARCHAR(50) NOT NULL,
    Quantity_Ordered INT NOT NULL,
    Quantity_Received INT DEFAULT 0,
    Unit_Price DECIMAL(10, 2),
    FOREIGN KEY (PO_Number) REFERENCES purchase_orders(PO_Number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS delivery_orders (
    DO_Number VARCHAR(20) PRIMARY KEY,
    PO_Number VARCHAR(20) NOT NULL,
    Delivery_Date DATETIME NOT NULL,
    Receiver_Badge VARCHAR(50) NOT NULL,
    Receiver_Name VARCHAR(100),
    Supplier_DO_Ref VARCHAR(100),
    Status ENUM('Checking', 'Verified', 'Discrepancy') DEFAULT 'Checking',
    Remarks TEXT,
    FOREIGN KEY (PO_Number) REFERENCES purchase_orders(PO_Number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS delivery_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    DO_Number VARCHAR(20) NOT NULL,
    PO_Item_ID INT NOT NULL,
    Part_Number VARCHAR(50) NOT NULL,
    Quantity_Delivered INT NOT NULL,
    Condition_Status VARCHAR(50),
    FOREIGN KEY (DO_Number) REFERENCES delivery_orders(DO_Number) ON DELETE CASCADE,
    FOREIGN KEY (PO_Item_ID) REFERENCES purchase_order_items(id) ON DELETE CASCADE
);
`;

(async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log('Executing schema updates...');
        await connection.query(schema);
        console.log('Schema updated successfully!');
        await connection.end();
        process.exit(0);
    } catch (e) {
        console.error('Failed to apply schema:', e);
        process.exit(1);
    }
})();
