const express = require('express');
const db = require('../database');
const { logAudit } = require('../utils/audit');
const { notifyEvent } = require('../utils/notifications');
const { isAuthenticated, isManager, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Create shared KPI
router.post('/', isManager, (req, res) => {
  const { title, description, uom, target, department, assignedTo, primaryOwnerId } = req.body;
  const createdBy = req.session.userId;

  if (!title || !uom || !target || !department) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
    return res.status(400).json({ error: 'At least one employee must be assigned' });
  }

  if (!primaryOwnerId) {
    return res.status(400).json({ error: 'Primary owner is required' });
  }

  // Create shared goal record
  db.run(`
    INSERT INTO shared_goals (title, description, uom, target, department, created_by, primary_owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [title, description, uom, target, department, createdBy, primaryOwnerId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const sharedGoalId = this.lastID;
    let completed = 0;
    let hasError = false;
    const expectedOperations = assignedTo.length * 2;

    const operationComplete = () => {
      completed += 1;
      if (completed === expectedOperations) {
        if (hasError) {
          return res.status(500).json({ error: 'Failed to complete shared KPI creation' });
        }
        res.json({ success: true, message: 'Department KPI shared successfully' });
      }
    };

    db.serialize(() => {
      assignedTo.forEach(employeeId => {
        db.run(`
          INSERT INTO shared_goal_assignments (shared_goal_id, user_id)
          VALUES (?, ?)
        `, [sharedGoalId, employeeId], err => {
          if (err) {
            hasError = true;
            console.error('Assignment insert error:', err);
          }
          operationComplete();
        });

        db.run(`
          INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, is_shared, shared_from_id, quarter)
          VALUES (?, 'Shared KPI', ?, ?, ?, ?, 10, 'approved', 1, ?, 'Q4-2024')
        `, [employeeId, title, description, uom, target, sharedGoalId], err => {
          if (err) {
            hasError = true;
            console.error('Shared goal goal insert error:', err);
          }
          operationComplete();
        });
      });
    });
    logAudit(createdBy, 'Create Shared KPI', 'shared_goal', sharedGoalId, `Shared KPI '${title}' for department ${department}`);
    db.all(`SELECT email FROM users WHERE id = ? OR id IN (${assignedTo.map(() => '?').join(',')})`, [primaryOwnerId, ...assignedTo], (err, addresses) => {
      const recipientEmails = Array.isArray(addresses) ? addresses.map(u => u.email).filter(Boolean) : [];
      notifyEvent({
        subject: 'Shared KPI Created',
        message: `A shared KPI '${title}' was created for department ${department}.`,
        recipients: recipientEmails
      }).catch(console.error);
    });
  });
});

// Get shared goals for department
router.get('/', isAuthenticated, (req, res) => {
  const department = req.session.department;
  
  const query = `
    SELECT sg.*, u.name as created_by_name, u2.name as primary_owner_name
    FROM shared_goals sg
    JOIN users u ON sg.created_by = u.id
    JOIN users u2 ON sg.primary_owner_id = u2.id
    WHERE sg.department = ?
    ORDER BY sg.created_at DESC
  `;
  
  db.all(query, [department], (err, sharedGoals) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Get assignments for each shared goal
    const promises = sharedGoals.map(goal => {
      return new Promise((resolve, reject) => {
        db.all(`
          SELECT u.id, u.name 
          FROM shared_goal_assignments sga
          JOIN users u ON sga.user_id = u.id
          WHERE sga.shared_goal_id = ?
        `, [goal.id], (err, assignments) => {
          goal.assignedTo = assignments;
          resolve(goal);
        });
      });
    });
    
    Promise.all(promises).then(results => {
      res.json(results);
    });
  });
});

// Update shared goal achievement (sync to all)
router.put('/:id/achievement', isAuthenticated, (req, res) => {
  const sharedGoalId = req.params.id;
  const { achievement } = req.body;

  db.get("SELECT primary_owner_id FROM shared_goals WHERE id = ?", [sharedGoalId], (err, sharedGoal) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!sharedGoal) {
      return res.status(404).json({ error: 'Shared goal not found' });
    }

    if (req.session.role !== 'admin' && req.session.userId !== sharedGoal.primary_owner_id) {
      return res.status(403).json({ error: 'Only the primary owner or admin can update this achievement' });
    }

    // Sync achievement to all goals created from this shared KPI
    db.run(`
      UPDATE goals 
      SET achievement = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE shared_from_id = ?
    `, [achievement, sharedGoalId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      logAudit(req.session.userId, 'Update Shared Achievement', 'shared_goal', sharedGoalId, `Updated shared KPI achievement to ${achievement}`);
      notifyEvent({
        subject: 'Shared KPI Achievement Updated',
        message: `Shared KPI achievement has been updated to ${achievement}.`,
        recipients: []
      }).catch(console.error);
      res.json({ success: true, message: 'Achievement synced to all team members' });
    });
  });
});

// Get employees by department
router.get('/employees/:department', isManager, (req, res) => {
  const department = req.params.department;
  
  db.all("SELECT id, name, username FROM users WHERE role = 'employee' AND department = ?", [department], (err, employees) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(employees);
  });
});

module.exports = router;