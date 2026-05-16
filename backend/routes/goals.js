const express = require('express');
const db = require('../database');
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
  
  // Check number of goals
  db.get("SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status != 'archived'", [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (row.count >= 8) {
      return res.status(400).json({ error: 'Maximum 8 goals per employee' });
    }
    
    if (weightage < 10) {
      return res.status(400).json({ error: 'Minimum weightage per goal is 10%' });
    }
    
    // Check total weightage
    db.get("SELECT SUM(weightage) as total FROM goals WHERE user_id = ? AND status != 'archived'", [userId], (err, weightRow) => {
      let totalWeight = weightRow.total || 0;
      totalWeight += weightage;
      
      if (Math.abs(totalWeight - 100) > 0.01 && totalWeight < 100) {
        // Allow if total will be exactly 100 after adding
        if (totalWeight > 100) {
          return res.status(400).json({ error: 'Total weightage cannot exceed 100%' });
        }
      }
      
      db.run(`
        INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, quarter)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [userId, thrustArea, title, description, uom, target, weightage, quarter || 'Q4-2024'], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ 
          success: true, 
          id: this.lastID,
          message: 'Goal created successfully and pending approval'
        });
      });
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
    
    res.json({ success: true, message: 'Rework requested' });
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
    
    if (goal.status === 'approved' && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Approved goals cannot be edited without admin intervention' });
    }
    
    if (goal.user_id !== userId && req.session.role === 'employee') {
      return res.status(403).json({ error: 'Cannot edit other users goals' });
    }
    
    let updates = [];
    let params = [];
    
    if (weightage) {
      if (weightage < 10) {
        return res.status(400).json({ error: 'Minimum weightage is 10%' });
      }
      updates.push("weightage = ?");
      params.push(weightage);
    }
    
    if (target) {
      updates.push("target = ?");
      params.push(target);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(goalId);
    
    db.run(`UPDATE goals SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true, message: 'Goal updated successfully' });
    });
  });
});

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