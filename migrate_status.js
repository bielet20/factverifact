const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('invoices.db');

db.serialize(() => {
    // Add status column
    db.run("ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'final'", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column "status" already exists.');
            } else {
                console.error('Error adding "status" column:', err.message);
            }
        } else {
            console.log('Added "status" column.');
        }
    });

    // Add finalized_at column
    db.run("ALTER TABLE invoices ADD COLUMN finalized_at TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column "finalized_at" already exists.');
            } else {
                console.error('Error adding "finalized_at" column:', err.message);
            }
        } else {
            console.log('Added "finalized_at" column.');

            // Backfill existing invoices
            db.run("UPDATE invoices SET finalized_at = created_at WHERE status = 'final'", (err) => {
                if (err) console.error("Error backfilling finalized_at:", err);
                else console.log("Backfilled finalized_at for existing invoices.");
                db.close();
            });
        }
    });
});
