const db = require('./database.js');
console.log('Database schema initialization triggered.');
setTimeout(() => {
    db.close((err) => {
        if (err) console.error(err.message);
        console.log('Database connection closed.');
        process.exit(0);
    });
}, 2000);
