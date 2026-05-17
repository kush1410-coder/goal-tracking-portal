const express = require('express');
const db = require('../database');
const { isAdmin, isAuthenticated } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { notifyEvent } = require('../utils/notifications');

const router = express.Router();
const escalationService = require('../services/escalationService');

function getActiveCycle(callback) {
  db.get(`SELECT active_cycle, created_at FROM cycle_settings ORDER BY id DESC LIMIT 1`, [], callback);
}

function createEscalationLog(ruleKey, department, triggeredFor, details, createdBy, callback) {
  db.run(`
    INSERT INTO escalation_logs (rule_key, department, triggered_for, details, created_by)
    VALUES (?, ?, ?, ?, ?)
  `, [ruleKey, department, triggeredFor, details, createdBy], callback);
}

router.get('/analytics/trends', isAdmin, (req, res) => {
  db.all(`
    SELECT quarter, COUNT(*) AS goal_count, AVG(progress_score) AS avg_progress
    FROM goals
    GROUP BY quarter
    ORDER BY quarter DESC
  `, [], (err, trends) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    db.all(`
      SELECT status, COUNT(*) AS count
      FROM goals
      GROUP BY status
    `, [], (err2, statusBreakdown) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ trends: trends || [], statusBreakdown: statusBreakdown || [] });
    });
  });
});

// QoQ trends for individual, team, or department
router.get('/analytics/qoq', isAdmin, (req, res) => {
  const level = req.query.level || 'department';
  const id = req.query.id; // userId or managerId or department

  if (level === 'individual' && !id) {
    return res.status(400).json({ error: 'id (userId) required for individual level' });
  }

  if (level === 'individual') {
    db.all(`
      SELECT quarter, AVG(progress_score) as avg_progress, COUNT(*) as count
      FROM goals
      WHERE user_id = ?
      GROUP BY quarter
      ORDER BY quarter DESC
    `, [id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ level, id, data: rows });
    });
    return;
  }

  if (level === 'team') {
    // id expected to be manager id
    db.get(`SELECT department FROM users WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return res.status(500).json({ error: 'Database error or manager not found' });
      const dept = row.department;
      db.all(`
        SELECT quarter, AVG(g.progress_score) as avg_progress, COUNT(*) as count
        FROM goals g
        JOIN users u ON g.user_id = u.id
        WHERE u.department = ?
        GROUP BY quarter
        ORDER BY quarter DESC
      `, [dept], (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({ level: 'team', managerId: id, department: dept, data: rows });
      });
    });
    return;
  }

  // department level or default
  const department = req.query.department;
  if (department) {
    db.all(`
      SELECT quarter, AVG(g.progress_score) as avg_progress, COUNT(*) as count
      FROM goals g
      JOIN users u ON g.user_id = u.id
      WHERE u.department = ?
      GROUP BY quarter
      ORDER BY quarter DESC
    `, [department], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ level: 'department', department, data: rows });
    });
    return;
  }

  // overall organization QoQ
  db.all(`
    SELECT quarter, AVG(progress_score) as avg_progress, COUNT(*) as count
    FROM goals
    GROUP BY quarter
    ORDER BY quarter DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ level: 'org', data: rows });
  });
});

// Heatmap-style data: department x quarter average progress
router.get('/analytics/heatmap', isAdmin, (req, res) => {
  db.all(`
    SELECT u.department as department, g.quarter as quarter, AVG(g.progress_score) as avg_progress, COUNT(*) as count
    FROM goals g
    JOIN users u ON g.user_id = u.id
    GROUP BY u.department, g.quarter
    ORDER BY u.department, g.quarter
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows || []);
  });
});

// Distribution: breakdown by thrust area, uom, and status
router.get('/analytics/distribution', isAdmin, (req, res) => {
  db.all(`SELECT thrust_area, COUNT(*) as count, AVG(progress_score) as avg_progress FROM goals GROUP BY thrust_area ORDER BY count DESC`, [], (err, byThrust) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.all(`SELECT uom, COUNT(*) as count, AVG(progress_score) as avg_progress FROM goals GROUP BY uom ORDER BY count DESC`, [], (err2, byUom) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      db.all(`SELECT status, COUNT(*) as count FROM goals GROUP BY status ORDER BY count DESC`, [], (err3, byStatus) => {
        if (err3) return res.status(500).json({ error: 'Database error' });
        res.json({ byThrust, byUom, byStatus });
      });
    });
  });
});

// Export analytics as CSV (basic)
router.get('/analytics/export', isAdmin, (req, res) => {
  const type = req.query.type || 'distribution';
  if (type === 'distribution') {
    db.all(`SELECT thrust_area, COUNT(*) as count, AVG(progress_score) as avg_progress FROM goals GROUP BY thrust_area ORDER BY count DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      let csv = 'thrust_area,count,avg_progress\n';
      rows.forEach(r => {
        csv += `${(r.thrust_area||'').replace(/\n/g,' ')} , ${r.count}, ${Number((r.avg_progress||0).toFixed(2))}\n`;
      });
      res.header('Content-Type', 'text/csv');
      res.attachment('distribution.csv');
      res.send(csv);
    });
  } else {
    res.status(400).json({ error: 'Unsupported export type' });
  }
});

router.get('/escalation-rules', isAdmin, (req, res) => {
  db.all(`SELECT * FROM escalation_rules ORDER BY created_at DESC`, [], (err, rules) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rules);
  });
});

router.put('/escalation-rules/:id', isAdmin, (req, res) => {
  const { threshold_days, active } = req.body;
  const ruleId = req.params.id;
  const updates = [];
  const params = [];

  if (threshold_days !== undefined) {
    updates.push('threshold_days = ?');
    params.push(threshold_days);
  }
  if (active !== undefined) {
    updates.push('active = ?');
    params.push(active ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  params.push(ruleId);
  db.run(`UPDATE escalation_rules SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, message: 'Escalation rule updated' });
  });
});

router.get('/escalations', isAdmin, (req, res) => {
  db.all(`SELECT * FROM escalation_logs ORDER BY created_at DESC LIMIT 100`, [], (err, logs) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(logs);
  });
});

router.post('/escalations/run', isAdmin, (req, res) => {
  const createdBy = req.session.userId;
  getActiveCycle((err, activeCycleRow) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!activeCycleRow) return res.status(400).json({ error: 'No active cycle configured' });

    const cycleStart = new Date(activeCycleRow.created_at);
    const now = new Date();

    db.all(`SELECT * FROM escalation_rules WHERE active = 1`, [], (err, rules) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      const allTasks = [];

      rules.forEach(rule => {
        const deadline = new Date(cycleStart);
        deadline.setDate(deadline.getDate() + rule.threshold_days);

        // helper to process escalation for a single employee-like record
        const processFor = (emp, getEmpIdentifier) => {
          allTasks.push(new Promise((resolve) => {
            const triggeredKey = getEmpIdentifier(emp);

            // find last escalation for this rule and target
            db.get(`SELECT * FROM escalation_logs WHERE rule_key = ? AND (triggered_for = ? OR triggered_for = ?) ORDER BY created_at DESC LIMIT 1`, [rule.rule_key, emp.email || '', emp.name || ''], (logErr, lastLog) => {
              if (logErr) return resolve({ rule: rule.rule_key, error: 'DB error' });

              const chain = ['employee','manager','hr'];
              const escalationDelayDays = rule.threshold_days || 3;

              const sendNotificationToRole = (role, cb) => {
                // resolve recipients by role
                if (role === 'employee') {
                  const recipients = emp.email ? [emp.email] : [];
                  const details = `notified:employee|email:${emp.email || ''}`;
                  createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy, () => {
                    if (recipients.length > 0) {
                      notifyEvent({
                        subject: `Escalation: ${rule.rule_key}`,
                        message: `Please address: ${rule.description || rule.rule_key}`,
                        link: `http://localhost:3000/?tab=goals`,
                        cardTitle: `Escalation: ${rule.rule_key}`,
                        cardSubtitle: rule.description || '',
                        recipients: recipients
                      }).catch(console.error);
                    }
                    cb();
                  });
                } else if (role === 'manager') {
                  db.get(`SELECT u.email, u.name FROM users u WHERE u.role = 'manager' AND u.department = ? LIMIT 1`, [emp.department || ''], (mgrErr, mgr) => {
                    const recipients = mgr?.email ? [mgr.email] : [];
                    const details = `notified:manager|email:${mgr?.email || ''}`;
                    createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy, () => {
                      if (recipients.length > 0) {
                        notifyEvent({
                          subject: `Escalation: ${rule.rule_key} — Manager Notice`,
                          message: `${emp.name} requires attention: ${rule.description || rule.rule_key}`,
                          link: `http://localhost:3000/?tab=team`,
                          cardTitle: `Escalation: ${rule.rule_key}`,
                          cardSubtitle: `${emp.name} — ${rule.description || ''}`,
                          recipients: recipients
                        }).catch(console.error);
                      }
                      cb();
                    });
                  });
                } else if (role === 'hr') {
                  db.all(`SELECT email FROM users WHERE role = 'hr'`, [], (hrErr, hrs) => {
                    const recipients = (hrs || []).map(h => h.email).filter(Boolean);
                    const details = `notified:hr|emails:${recipients.join(',')}`;
                    createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy, () => {
                      if (recipients.length > 0) {
                        notifyEvent({
                          subject: `Escalation: ${rule.rule_key} — HR Notice`,
                          message: `${emp.name} requires HR intervention: ${rule.description || rule.rule_key}`,
                          link: `http://localhost:3000/?tab=admin`,
                          cardTitle: `Escalation: ${rule.rule_key}`,
                          cardSubtitle: `${emp.name} — ${rule.description || ''}`,
                          recipients: recipients
                        }).catch(console.error);
                      }
                      cb();
                    });
                  });
                } else {
                  cb();
                }
              };

              // if no previous log or previous log is not a notified type, send first to employee
              if (!lastLog || !lastLog.details || !lastLog.details.startsWith('notified:')) {
                sendNotificationToRole('employee', () => resolve({ rule: rule.rule_key, triggered_for: triggeredKey, step: 'employee' }));
                return;
              }

              // parse last notified role
              const lastDetails = lastLog.details || '';
              const match = lastDetails.match(/^notified:([^|]+)\|/);
              const lastRole = match ? match[1] : null;
              const lastDate = new Date(lastLog.created_at);
              const daysElapsed = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

              const lastIndex = lastRole ? chain.indexOf(lastRole) : -1;
              const nextIndex = lastIndex + 1;

              if (nextIndex >= chain.length) {
                // already fully escalated
                return resolve({ rule: rule.rule_key, triggered_for: triggeredKey, escalated: 'complete' });
              }

              // only escalate if enough days have passed since last notification
              if (daysElapsed >= (rule.threshold_days || 3)) {
                const nextRole = chain[nextIndex];
                sendNotificationToRole(nextRole, () => resolve({ rule: rule.rule_key, triggered_for: triggeredKey, step: nextRole }));
              } else {
                resolve({ rule: rule.rule_key, triggered_for: triggeredKey, escalated: 'waiting', daysElapsed });
              }
            });
          }));
        };

        // Evaluate rule-specific targets
        if (rule.rule_key === 'goal_submission' && now >= deadline) {
          db.all(`
            SELECT u.id, u.name, u.email, u.department
            FROM users u
            WHERE u.role = 'employee'
              AND NOT EXISTS (
                SELECT 1 FROM goals g WHERE g.user_id = u.id AND g.quarter = ?
              )
          `, [activeCycleRow.active_cycle], (err, employees) => {
            if (err) return; // continue
            employees.forEach(emp => processFor(emp, e => e.email || e.name));
          });
        }

        if (rule.rule_key === 'goal_approval') {
          db.all(`
            SELECT g.id, g.title, u.id as user_id, u.name AS employee_name, u.department, u.email
            FROM goals g
            JOIN users u ON g.user_id = u.id
            WHERE g.status = 'pending'
              AND julianday('now') - julianday(g.created_at) > ?
          `, [rule.threshold_days], (err, goals) => {
            if (err) return;
            goals.forEach(goal => processFor({ id: goal.user_id, name: goal.employee_name, email: goal.email, department: goal.department }, e => e.email || e.name));
          });
        }

        if (rule.rule_key === 'checkin_missing') {
          db.all(`
            SELECT u.id, u.name, u.email, u.department
            FROM users u
            JOIN goals g ON g.user_id = u.id
            WHERE g.status = 'approved'
              AND g.quarter = ?
              AND NOT EXISTS (
                SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.quarter = ?
              )
            GROUP BY u.id
          `, [activeCycleRow.active_cycle, activeCycleRow.active_cycle], (err, employees) => {
            if (err) return;
            employees.forEach(emp => processFor(emp, e => e.email || e.name));
          });
        }
      });

      // Wait briefly for all tasks to be queued and then respond (tasks add Promises to allTasks)
      setTimeout(() => {
        Promise.all(allTasks).then(results => res.json({ success: true, results })).catch(() => res.json({ success: true }));
      }, 600);
    });
  });
});

// Run reminders for missing check-ins (Admin)
router.post('/reminders/run', isAdmin, async (req, res) => {
  try {
    const createdBy = req.session.userId;
    const result = await escalationService.runReminders(createdBy);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to run reminders' });
  }
});

router.post('/cycles', isAdmin, (req, res) => {
  const { active_cycle } = req.body;

  if (!active_cycle || typeof active_cycle !== 'string') {
    return res.status(400).json({ error: 'Active cycle is required' });
  }

  db.run(`INSERT INTO cycle_settings (active_cycle) VALUES (?)`, [active_cycle], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    logAudit(req.session.userId, 'Update Cycle', 'cycle', this.lastID, `Active cycle changed to ${active_cycle}`);
    res.json({ success: true, active_cycle });
  });
});

router.put('/goal/:id/unlock', isAdmin, (req, res) => {
  const goalId = req.params.id;

  db.run(`
    UPDATE goals
    SET status = 'pending', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [goalId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    logAudit(req.session.userId, 'Unlock Goal', 'goal', goalId, 'Unlocked goal for revision');
    res.json({ success: true, message: 'Goal unlocked for revision' });
  });
});

module.exports = router;
