const express = require('express');
const db = require('../database');
const { logAudit } = require('../utils/audit');
const { notifyEvent } = require('../utils/notifications');
const { isAuthenticated, isManager } = require('../middleware/auth');

const router = express.Router();

// Create/update check-in
router.post('/', isAuthenticated, (req, res) => {
  const { goalId, achievement, status, comment, quarter } = req.body;
  const userId = req.session.userId;
  
  db.run(`
    INSERT INTO checkins (user_id, goal_id, achievement, status, comment, quarter)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, goal_id, quarter) DO UPDATE SET
      achievement = excluded.achievement,
      status = excluded.status,
      comment = excluded.comment,
      created_at = CURRENT_TIMESTAMP
  `, [userId, goalId, achievement, status, comment, quarter], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Also update the goal's achievement
    db.run(`
      UPDATE goals 
      SET achievement = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `, [achievement, goalId, userId], (goalErr) => {
      if (goalErr) {
        console.error('Goal achievement update error:', goalErr);
      }
      logAudit(userId, 'Check-in', 'goal', goalId, `Check-in saved for quarter ${quarter} status ${status}`);
      db.get(`SELECT u.email FROM users u JOIN goals g ON g.user_id = u.id WHERE g.id = ?`, [goalId], (emailErr, owner) => {
        if (!emailErr && owner?.email) {
          notifyEvent({
            subject: 'Check-in Submitted',
            message: `A check-in was submitted for goal ${goalId} in quarter ${quarter}.`,
            link: `http://localhost:3000/?goalId=${goalId}&tab=checkins`,
            cardTitle: 'Check-in Submitted',
            cardSubtitle: `Quarterly update saved for your goal.`,
            recipients: [owner.email]
          }).catch(console.error);
        }
      });
      // Notify manager as well
      db.get(`SELECT u.email FROM users u JOIN users emp ON emp.department = u.department WHERE u.role = 'manager' AND emp.id = ? LIMIT 1`, [userId], (mgrErr, mgr) => {
        if (!mgrErr && mgr?.email) {
          notifyEvent({
            subject: 'Team Member Check-in Submitted',
            message: `${req.session.name} submitted a check-in for goal ${goalId} (quarter ${quarter}).`,
            link: `http://localhost:3000/?goalId=${goalId}&tab=team`,
            cardTitle: 'Team Check-in Submitted',
            cardSubtitle: `${req.session.name} updated their quarterly progress.`,
            recipients: [mgr.email]
          }).catch(console.error);
        }
      });
      res.json({ success: true, message: 'Check-in saved successfully' });
    });
  });
});

// Get user's check-ins
router.get('/', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const quarter = req.query.quarter || 'Q4-2024';
  
  const query = `
    SELECT c.*, g.title, g.uom, g.target 
    FROM checkins c
    JOIN goals g ON c.goal_id = g.id
    WHERE c.user_id = ? AND c.quarter = ?
    ORDER BY c.created_at DESC
  `;
  
  db.all(query, [userId, quarter], (err, checkins) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(checkins);
  });
});

// Add manager comment
router.post('/manager-comment', isManager, (req, res) => {
  const { employeeId, goalId, comment, quarter } = req.body;
  const managerId = req.session.userId;
  
  db.run(`
    INSERT INTO manager_comments (manager_id, employee_id, goal_id, comment, quarter)
    VALUES (?, ?, ?, ?, ?)
  `, [managerId, employeeId, goalId, comment, quarter], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ success: true, message: 'Manager comment added successfully' });
    logAudit(managerId, 'Manager Comment', 'goal', goalId, `Added manager comment for employee ${employeeId} quarter ${quarter}`);
    db.get('SELECT email FROM users WHERE id = ?', [employeeId], (emailErr, employee) => {
      if (!emailErr && employee?.email) {
        notifyEvent({
          subject: 'New Manager Comment',
          message: `A manager has added a comment to your goal for quarter ${quarter}.`,
          recipients: [employee.email]
        }).catch(console.error);
      }
    });
  });
});

// Get manager comments for an employee
router.get('/manager-comments/:employeeId', isAuthenticated, (req, res) => {
  const employeeId = req.params.employeeId;
  const userId = req.session.userId;
  
  // Employees can only see their own comments, managers can see their team's
  if (req.session.role === 'employee' && parseInt(employeeId) !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const query = `
    SELECT mc.*, u.name as manager_name, g.title as goal_title
    FROM manager_comments mc
    JOIN users u ON mc.manager_id = u.id
    JOIN goals g ON mc.goal_id = g.id
    WHERE mc.employee_id = ?
    ORDER BY mc.created_at DESC
  `;
  
  db.all(query, [employeeId], (err, comments) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(comments);
  });
});

module.exports = router;