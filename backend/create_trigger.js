const db = require('./config/db');

const sql = `
DROP TRIGGER IF EXISTS \`auto_update_status\`;
CREATE TRIGGER \`auto_update_status\` BEFORE UPDATE ON \`masterdata\`
 FOR EACH ROW BEGIN
    IF NEW.Quantity OR NEW.Quantity_Use_Each_Machine OR NEW.Total_Machine THEN
        SET NEW.Safety_Stock = NEW.Quantity_Use_Each_Machine * NEW.Total_Machine;
    END IF;
    
    IF NEW.Quantity = 0 THEN
    	SET NEW.Part_Status = 'URGENT PART';
    ELSEIF NEW.Quantity <= NEW.Safety_Stock THEN
    	SET NEW.Part_Status = 'ORDER PART';
    ELSEIF NEW.Quantity > NEW.Safety_Stock THEN
    	SET NEW.Part_Status = 'STOCK ENOUGH';
    END IF;
    
    IF NEW.Part_Criteria = 'REPLACEMENT PART' OR NEW.Part_Criteria = 'CONSUMABLE PART' THEN
    	SET NEW.Part_Category = 'CRITICAL PART';
    ELSE
    	SET NEW.Part_Category = 'NO CRITICAL PART';
    END IF;
    IF NEW.Quantity >= NEW.Safety_Stock AND NEW.Safety_Stock <= NEW.Quantity THEN
    	SET NEW.Request_Reason = 'STOCK ENOUGH';
    ELSEIF NEW.Quantity = 0 AND NEW.Quantity < NEW.Safety_Stock THEN
    	SET NEW.Request_Reason = 'NO SPARE';
    ELSE
    	SET NEW.Request_Reason = 'MINIMAL STOCK';
    END IF;
    
    IF NEW.Request_Reason = 'STOCK ENOUGH' AND NEW.Part_Status = 'STOCK ENOUGH' THEN
    	SET NEW.Priority_Level = 'No Request';
    ELSEIF NEW.Part_Status = 'ORDER PART' AND NEW.Part_Category = 'NO CRITICAL PART' AND NEW.Part_Criteria = 'REPLACEMENT PART' THEN 
    	SET NEW.Priority_Level = '2nd Priority';
    ELSEIF NEW.Part_Status = 'ORDER PART' AND NEW.Part_Category = 'NO CRITICAL PART' AND NEW.Part_Criteria = 'INSURANCE PART' THEN 
    	SET NEW.Priority_Level = '2nd Priority';
    ELSEIF NEW.Part_Status = 'ORDER PART' AND NEW.Part_Category = 'NO CRITICAL PART' AND NEW.Part_Criteria = 'CONSUMABLE PART' THEN 
    	SET NEW.Priority_Level = '2nd Priority';
    ELSE
    	SET NEW.Priority_Level = '1st Priority';
    END IF;
END
`;

db.query(sql, (err, result) => {
    if (err) {
        console.error("Error creating trigger:", err);
    } else {
        console.log("Trigger auto_update_status created successfully.");
    }
    process.exit();
});
