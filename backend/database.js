const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'goal_tracking.db');
const db = new sqlite3.Database(dbPath);

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

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_unique ON checkins(user_id, goal_id, quarter)
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

  // Cycle settings for admin configuration
  db.run(`
    CREATE TABLE IF NOT EXISTS cycle_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      active_cycle TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    INSERT INTO cycle_settings (active_cycle)
    SELECT 'Q4-2024'
    WHERE NOT EXISTS (SELECT 1 FROM cycle_settings)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Escalation rules and logs for rule-based notifications
  db.run(`
    CREATE TABLE IF NOT EXISTS escalation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key TEXT UNIQUE,
      description TEXT,
      threshold_days INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS escalation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key TEXT,
      department TEXT,
      triggered_for TEXT,
      details TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    INSERT INTO escalation_rules (rule_key, description, threshold_days)
    SELECT 'goal_submission', 'Employee has not submitted goals within N days of active cycle', 7
    WHERE NOT EXISTS (SELECT 1 FROM escalation_rules WHERE rule_key = 'goal_submission')
  `);

  db.run(`
    INSERT INTO escalation_rules (rule_key, description, threshold_days)
    SELECT 'goal_approval', 'Manager has not approved pending goals within N days of submission', 5
    WHERE NOT EXISTS (SELECT 1 FROM escalation_rules WHERE rule_key = 'goal_approval')
  `);

  db.run(`
    INSERT INTO escalation_rules (rule_key, description, threshold_days)
    SELECT 'checkin_missing', 'Quarterly check-in not completed within the active window', 14
    WHERE NOT EXISTS (SELECT 1 FROM escalation_rules WHERE rule_key = 'checkin_missing')
  `);

  // Insert sample data
  if (process.env.NODE_ENV !== 'test') {
    insertSampleData();
  }
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
        { username: 'hr', password: 'hr123', name: 'HR User', email: 'hr@example.com', role: 'hr', department: 'All' },
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