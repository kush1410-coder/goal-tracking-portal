const express = require('express');
const db = require('../database');
const { logAudit } = require('../utils/audit');
const { notifyEvent } = require('../utils/notifications');
const { isAuthenticated, isManager } = require('../middleware/auth');

const router = express.Router();

// Helper function to calculate progress score
function calculateProgressScore(uom, target, achievement) {
  if (!achievement) return 0;
  
  switch(uom) {
    case 'numeric':
    case 'percentage':
      // Higher is better
      return Math.min((parseFloat(achievement) / parseFloat(target)) * 100, 100);
    case 'timeline':
      // Lower is better
      const targetDate = new Date(target);
      const achievementDate = new Date(achievement);
      if (achievementDate <= targetDate) return 100;
      const diffDays = Math.ceil((achievementDate - targetDate) / (1000 * 60 * 60 * 24));
      return Math.max(100 - (diffDays * 10), 0);
    case 'zero':
      // Zero = Success
      return parseFloat(achievement) === 0 ? 100 : 0;
    default:
      return 0;
  }
}

// Get user's goals
router.get('/', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const role = req.session.role;
  
  let query = "SELECT * FROM goals";
  let params = [];
  
  if (role === 'employee') {
    query += " WHERE user_id = ?";
    params.push(userId);
  } else if (role === 'manager') {
    query += " WHERE user_id IN (SELECT id FROM users WHERE department = ?)";
    params.push(req.session.department);
  }
  
  query += " ORDER BY created_at DESC";
  
  db.all(query, params, (err, goals) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(goals);
  });
});

// Create goal
router.post('/', isAuthenticated, (req, res) => {
  const { thrustArea, title, description, uom, target, weightage, quarter } = req.body;
  const userId = req.session.userId;

  if (!thrustArea || !title || !uom || !target || isNaN(parseFloat(weightage))) {
    return res.status(400).json({ error: 'All required goal fields must be completed correctly' });
  }

  const numericWeight = parseFloat(weightage);
  if (numericWeight < 10 || numericWeight > 100) {
    return res.status(400).json({ error: 'Minimum weightage per goal is 10% and must be at most 100%' });
  }

  const quarterValue = quarter && quarter.trim() ? quarter.trim() : null;

  const insertGoal = (targetQuarter) => {
    db.run(`
      INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, quarter)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [userId, thrustArea, title, description, uom, target, numericWeight, targetQuarter], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      logAudit(userId, 'Create Goal', 'goal', this.lastID, `Created goal ${title} for ${targetQuarter}`);
      db.get("SELECT email FROM users WHERE department = ? AND role = 'manager' LIMIT 1", [req.session.department], (mgrErr, manager) => {
        if (!mgrErr && manager?.email) {
          notifyEvent({
            subject: 'New Goal Submitted',
            message: `A new goal titled '${title}' was submitted by ${req.session.name} and awaits approval.`,
            link: `http://localhost:3000/?goalId=${this.lastID}`,
            cardTitle: 'New Goal Awaiting Approval',
            cardSubtitle: `Goal '${title}' submitted by ${req.session.name}.`,
            recipients: [manager.email]
          }).catch(console.error);
        }
      });
      res.json({ 
        success: true, 
        id: this.lastID,
        message: 'Goal created successfully and pending approval'
      });
    });
  };

  // Check number of goals
  db.get("SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status != 'archived'", [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (row.count >= 8) {
      return res.status(400).json({ error: 'Maximum 8 goals per employee' });
    }
    
    // Check total weightage
    db.get("SELECT SUM(weightage) as total FROM goals WHERE user_id = ? AND status != 'archived'", [userId], (err, weightRow) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      let totalWeight = weightRow.total || 0;
      totalWeight += numericWeight;
      if (totalWeight > 100) {
        return res.status(400).json({ error: 'Total weightage cannot exceed 100%' });
      }
      
      if (quarterValue) {
        insertGoal(quarterValue);
      } else {
        db.get("SELECT active_cycle FROM cycle_settings ORDER BY id DESC LIMIT 1", [], (err, row) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          insertGoal(row?.active_cycle || 'Q4-2024');
        });
      }
    });
  });
});

// Approve goal (Manager/Admin)
router.put('/:id/approve', isManager, (req, res) => {
  const goalId = req.params.id;
  
  db.run("UPDATE goals SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [goalId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    logAudit(req.session.userId, 'Approve Goal', 'goal', goalId, 'Approved goal');
    db.get(`SELECT u.email FROM users u JOIN goals g ON g.user_id = u.id WHERE g.id = ?`, [goalId], (emailErr, owner) => {
      if (!emailErr && owner?.email) {
        notifyEvent({
          subject: 'Goal Approved',
          message: `Your goal has been approved by ${req.session.name}.`,
          link: `http://localhost:3000/?goalId=${goalId}`,
          cardTitle: 'Goal Approved',
          cardSubtitle: `Your goal was approved by ${req.session.name}.`,
          recipients: [owner.email]
        }).catch(console.error);
      }
    });
    res.json({ success: true, message: 'Goal approved successfully' });
  });
});

// Request rework (Manager)
router.put('/:id/rework', isManager, (req, res) => {
  const goalId = req.params.id;
  
  db.run("UPDATE goals SET status = 'rework', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [goalId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    logAudit(req.session.userId, 'Request Rework', 'goal', goalId, 'Requested rework for goal');
    db.get(`SELECT u.email FROM users u JOIN goals g ON g.user_id = u.id WHERE g.id = ?`, [goalId], (emailErr, owner) => {
      if (!emailErr && owner?.email) {
        notifyEvent({
          subject: 'Goal Rework Requested',
          message: `Your goal requires rework: a manager has requested changes.`,
          link: `http://localhost:3000/?goalId=${goalId}`,
          cardTitle: 'Goal Rework Requested',
          cardSubtitle: `A manager requested changes on your goal.`,
          recipients: [owner.email]
        }).catch(console.error);
      }
    });
    res.json({ success: true, message: 'Rework requested' });
  });
});

// Reject goal (Manager/Admin)
router.put('/:id/reject', isManager, (req, res) => {
  const goalId = req.params.id;

  db.run("UPDATE goals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [goalId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    logAudit(req.session.userId, 'Reject Goal', 'goal', goalId, 'Rejected goal');
    db.get(`SELECT u.email FROM users u JOIN goals g ON g.user_id = u.id WHERE g.id = ?`, [goalId], (emailErr, owner) => {
      if (!emailErr && owner?.email) {
        notifyEvent({
          subject: 'Goal Rejected',
          message: `Your goal has been rejected by ${req.session.name}. Please revise and resubmit.`,
          link: `http://localhost:3000/?goalId=${goalId}`,
          cardTitle: 'Goal Rejected',
          cardSubtitle: `Please update your goal and resubmit for approval.`,
          recipients: [owner.email]
        }).catch(console.error);
      }
    });
    res.json({ success: true, message: 'Goal rejected' });
  });
});

// Update goal (edit weightage/target)
router.put('/:id', isAuthenticated, (req, res) => {
  const goalId = req.params.id;
  const { weightage, target } = req.body;
  const userId = req.session.userId;
  
  // Check if goal is locked
  db.get("SELECT status, user_id FROM goals WHERE id = ?", [goalId], (err, goal) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    if (goal.status === 'approved' && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Approved goals cannot be edited without admin intervention' });
    }
    
    if (goal.user_id !== userId && req.session.role === 'employee') {
      return res.status(403).json({ error: 'Cannot edit other users goals' });
    }
    
    const updates = [];
    const params = [];

    const updateGoal = () => {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(goalId);

      db.run(`UPDATE goals SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        logAudit(userId, 'Update Goal', 'goal', goalId, 'Updated goal');
        // Notify manager of update
        db.get(`SELECT u.email FROM users u JOIN users owner ON owner.department = u.department WHERE u.role = 'manager' AND owner.id = ? LIMIT 1`, [goal.user_id], (mgrErr, mgr) => {
          if (!mgrErr && mgr?.email) {
            notifyEvent({
              subject: 'Goal Updated',
              message: `A goal was updated for ${goal.user_id}. Please review.`,
              link: `http://localhost:3000/?goalId=${goalId}`,
              cardTitle: 'Goal Updated',
              cardSubtitle: `A team member updated a goal and may need your attention.`,
              recipients: [mgr.email]
            }).catch(console.error);
          }
        });
        res.json({ success: true, message: 'Goal updated successfully' });
      });
    };
    
    if (weightage !== undefined) {
      if (isNaN(weightage) || weightage < 10 || weightage > 100) {
        return res.status(400).json({ error: 'Weightage must be a number between 10 and 100' });
      }

      db.get("SELECT SUM(weightage) as total FROM goals WHERE user_id = ? AND status != 'archived' AND id != ?", [userId, goalId], (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        const totalWeight = (row.total || 0) + weightage;
        if (totalWeight > 100) {
          return res.status(400).json({ error: 'Total weightage cannot exceed 100%' });
        }

        updates.push("weightage = ?");
        params.push(weightage);

        if (target) {
          updates.push("target = ?");
          params.push(target);
        }

        updateGoal();
      });
    } else {
      if (target) {
        updates.push("target = ?");
        params.push(target);
      }
      updateGoal();
    }
  });
});

// Notify manager when a goal is updated by an employee
// (hook into the existing update route by using audit and notify after update)

// Update achievement
router.put('/:id/achievement', isAuthenticated, (req, res) => {
  const goalId = req.params.id;
  const { achievement } = req.body;
  const userId = req.session.userId;
  
  db.get("SELECT uom, target FROM goals WHERE id = ? AND user_id = ?", [goalId, userId], (err, goal) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    const progressScore = calculateProgressScore(goal.uom, goal.target, achievement);
    
    db.run(`
      UPDATE goals 
      SET achievement = ?, progress_score = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [achievement, progressScore, goalId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true, progressScore });
    });
  });
});

// Get team goals (for manager)
router.get('/team', isManager, (req, res) => {
  const department = req.session.department;
  
  const query = `
    SELECT g.*, u.name as employee_name, u.id as employee_id
    FROM goals g
    JOIN users u ON g.user_id = u.id
    WHERE u.department = ? AND u.role = 'employee'
    ORDER BY u.name, g.created_at DESC
  `;
  
  db.all(query, [department], (err, goals) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Group by employee
    const grouped = {};
    goals.forEach(goal => {
      if (!grouped[goal.employee_id]) {
        grouped[goal.employee_id] = {
          employee_id: goal.employee_id,
          employee_name: goal.employee_name,
          goals: []
        };
      }
      grouped[goal.employee_id].goals.push(goal);
    });
    
    res.json(Object.values(grouped));
  });
});

module.exports = router;