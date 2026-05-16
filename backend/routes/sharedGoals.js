const express = require('express');
const db = require('../database');
const { isAuthenticated, isManager, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Create shared KPI
router.post('/', isManager, (req, res) => {
  const { title, description, uom, target, department, assignedTo, primaryOwnerId } = req.body;
  const createdBy = req.session.userId;
  
  // Create shared goal record
  db.run(`
    INSERT INTO shared_goals (title, description, uom, target, department, created_by, primary_owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [title, description, uom, target, department, createdBy, primaryOwnerId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const sharedGoalId = this.lastID;
    
    // Assign to selected employees
    assignedTo.forEach(employeeId => {
      db.run(`
        INSERT INTO shared_goal_assignments (shared_goal_id, user_id)
        VALUES (?, ?)
      `, [sharedGoalId, employeeId]);
      
      // Create goal for each employee (read-only title/target)
      db.run(`
        INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, is_shared, shared_from_id, quarter)
        VALUES (?, 'Shared KPI', ?, ?, ?, ?, 10, 'approved', 1, ?, 'Q4-2024')
      `, [employeeId, title, description, uom, target, sharedGoalId]);
    });
    
    res.json({ success: true, message: 'Department KPI shared successfully' });
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
    
    // Update primary owner's goal
    db.run(`
      UPDATE goals 
      SET achievement = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE shared_from_id = ? AND user_id = ?
    `, [achievement, sharedGoalId, sharedGoal.primary_owner_id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Sync to all other assigned users
      db.run(`
        UPDATE goals 
        SET achievement = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE shared_from_id = ?
      `, [achievement, sharedGoalId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ success: true, message: 'Achievement synced to all team members' });
      });
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