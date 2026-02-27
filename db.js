const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
}

const db = {
    read: () => {
        try {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            return { users: [] };
        }
    },
    write: (data) => {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    },

    // Helper methods
    getUsers: () => db.read().users,
    addUser: (user) => {
        const data = db.read();
        data.users.push({
            id: Date.now(),
            created_at: new Date().toISOString(),
            is_verified: 0,
            ...user
        });
        db.write(data);
        return user;
    },
    findUserByEmail: (email) => {
        return db.read().users.find(u => u.email === email);
    },
    updateUser: (email, updates) => {
        const data = db.read();
        const index = data.users.findIndex(u => u.email === email);
        if (index !== -1) {
            data.users[index] = { ...data.users[index], ...updates };
            db.write(data);
            return true;
        }
        return false;
    }
};

module.exports = db;
