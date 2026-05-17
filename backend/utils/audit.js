const db = require('../database');

function logAudit(userId, action, targetType = null, targetId = null, details = null) {
  db.run(
    `INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`,
    [userId, action, targetType, targetId, details],
    (err) => {
      if (err) {
        console.error('Audit log error:', err);
      }
    }
  );
}

module.exports = { logAudit };