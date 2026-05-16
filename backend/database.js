const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'goal_tracking.db'));

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      name TEXT,
      email TEXT,
      role TEXT,
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Goals table
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      thrust_area TEXT,
      title TEXT,
      description TEXT,
      uom TEXT,
      target TEXT,
      weightage REAL,
      achievement TEXT,
      progress_score REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      is_shared BOOLEAN DEFAULT 0,
      shared_from_id INTEGER,
      quarter TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Check-ins table
  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      goal_id INTEGER,
      achievement TEXT,
      status TEXT,
      comment TEXT,
      quarter TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    )
  `);

  // Manager comments table
  db.run(`
    CREATE TABLE IF NOT EXISTS manager_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER,
      employee_id INTEGER,
      goal_id INTEGER,
      comment TEXT,
      quarter TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id),
      FOREIGN KEY (employee_id) REFERENCES users(id),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    )
  `);

  // Shared goals table
  db.run(`
    CREATE TABLE IF NOT EXISTS shared_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      uom TEXT,
      target TEXT,
      department TEXT,
      created_by INTEGER,
      primary_owner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (primary_owner_id) REFERENCES users(id)
    )
  `);

  // Shared goal assignments
  db.run(`
    CREATE TABLE IF NOT EXISTS shared_goal_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shared_goal_id INTEGER,
      user_id INTEGER,
      weightage REAL DEFAULT 10,
      FOREIGN KEY (shared_goal_id) REFERENCES shared_goals(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Insert sample data
  insertSampleData();
});

function insertSampleData() {
  // Check if users exist
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row.count === 0) {
      const bcrypt = require('bcryptjs');
      
      const sampleUsers = [
        { username: 'john', password: 'password123', name: 'John Doe', email: 'john@example.com', role: 'employee', department: 'Sales' },
        { username: 'sarah', password: 'password123', name: 'Sarah Smith', email: 'sarah@example.com', role: 'manager', department: 'Sales' },
        { username: 'admin', password: 'admin123', name: 'Admin User', email: 'admin@example.com', role: 'admin', department: 'All' },
        { username: 'jane', password: 'password123', name: 'Jane Wilson', email: 'jane@example.com', role: 'employee', department: 'Sales' }
      ];

      sampleUsers.forEach(user => {
        const hashedPassword = bcrypt.hashSync(user.password, 10);
        db.run(
          "INSERT INTO users (username, password, name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)",
          [user.username, hashedPassword, user.name, user.email, user.role, user.department]
        );
      });

      // Add sample goals after users are created
      setTimeout(() => {
        db.get("SELECT id FROM users WHERE username = 'john'", (err, john) => {
          if (john) {
            db.run(`
              INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, quarter)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [john.id, 'Sales', 'Increase Sales Revenue', 'Achieve quarterly sales target of $1M', 'numeric', '1000000', 40, 'approved', 'Q4-2024']);
            
            db.run(`
              INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, quarter)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [john.id, 'Product', 'Complete Product Launch', 'Successfully launch new product by deadline', 'timeline', '2024-12-31', 30, 'approved', 'Q4-2024']);
          }
        });
      }, 100);
    }
  });
}

module.exports = db;