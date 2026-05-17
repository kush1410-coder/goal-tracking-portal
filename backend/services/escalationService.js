const db = require('../database');
const { notifyEvent } = require('../utils/notifications');

function createEscalationLog(ruleKey, department, triggeredFor, details, createdBy) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO escalation_logs (rule_key, department, triggered_for, details, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [ruleKey, department, triggeredFor, details, createdBy], function(err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

function runEscalations(createdBy) {
  return new Promise((resolve) => {
    db.get(`SELECT active_cycle, created_at FROM cycle_settings ORDER BY id DESC LIMIT 1`, [], (err, activeCycleRow) => {
      if (err || !activeCycleRow) return resolve({ error: 'No active cycle' });

      const cycleStart = new Date(activeCycleRow.created_at);
      const now = new Date();

      db.all(`SELECT * FROM escalation_rules WHERE active = 1`, [], (err, rules) => {
        if (err) return resolve({ error: 'DB error' });

        const allTasks = [];

        rules.forEach(rule => {
          const deadline = new Date(cycleStart);
          deadline.setDate(deadline.getDate() + rule.threshold_days);

          const processFor = (emp, getEmpIdentifier) => {
            allTasks.push(new Promise((resolveP) => {
              const triggeredKey = getEmpIdentifier(emp);

              db.get(`SELECT * FROM escalation_logs WHERE rule_key = ? AND (triggered_for = ? OR triggered_for = ?) ORDER BY created_at DESC LIMIT 1`, [rule.rule_key, emp.email || '', emp.name || ''], (logErr, lastLog) => {
                if (logErr) return resolveP({ rule: rule.rule_key, error: 'DB error' });

                const chain = ['employee','manager','hr'];

                const sendNotificationToRole = (role, cb) => {
                  if (role === 'employee') {
                    const recipients = emp.email ? [emp.email] : [];
                    const details = `notified:employee|email:${emp.email || ''}`;
                    createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy).then(() => {
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
                    }).catch(() => cb());
                  } else if (role === 'manager') {
                    db.get(`SELECT u.email, u.name FROM users u WHERE u.role = 'manager' AND u.department = ? LIMIT 1`, [emp.department || ''], (mgrErr, mgr) => {
                      const recipients = mgr?.email ? [mgr.email] : [];
                      const details = `notified:manager|email:${mgr?.email || ''}`;
                      createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy).then(() => {
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
                      }).catch(() => cb());
                    });
                  } else if (role === 'hr') {
                    db.all(`SELECT email FROM users WHERE role = 'hr'`, [], (hrErr, hrs) => {
                      const recipients = (hrs || []).map(h => h.email).filter(Boolean);
                      const details = `notified:hr|emails:${recipients.join(',')}`;
                      createEscalationLog(rule.rule_key, emp.department || '', triggeredKey, details, createdBy).then(() => {
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
                      }).catch(() => cb());
                    });
                  } else {
                    cb();
                  }
                };

                if (!lastLog || !lastLog.details || !lastLog.details.startsWith('notified:')) {
                  sendNotificationToRole('employee', () => resolveP({ rule: rule.rule_key, triggered_for: triggeredKey, step: 'employee' }));
                  return;
                }

                const lastDetails = lastLog.details || '';
                const match = lastDetails.match(/^notified:([^|]+)\|/);
                const lastRole = match ? match[1] : null;
                const lastDate = new Date(lastLog.created_at);
                const daysElapsed = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

                const lastIndex = lastRole ? chain.indexOf(lastRole) : -1;
                const nextIndex = lastIndex + 1;

                if (nextIndex >= chain.length) {
                  return resolveP({ rule: rule.rule_key, triggered_for: triggeredKey, escalated: 'complete' });
                }

                if (daysElapsed >= (rule.threshold_days || 3)) {
                  const nextRole = chain[nextIndex];
                  sendNotificationToRole(nextRole, () => resolveP({ rule: rule.rule_key, triggered_for: triggeredKey, step: nextRole }));
                } else {
                  resolveP({ rule: rule.rule_key, triggered_for: triggeredKey, escalated: 'waiting', daysElapsed });
                }
              });
            }));
          };

          // targets
          if (rule.rule_key === 'goal_submission' && now >= deadline) {
            db.all(`
              SELECT u.id, u.name, u.email, u.department
              FROM users u
              WHERE u.role = 'employee'
                AND NOT EXISTS (
                  SELECT 1 FROM goals g WHERE g.user_id = u.id AND g.quarter = ?
                )
            `, [activeCycleRow.active_cycle], (err, employees) => {
              if (!err && employees) employees.forEach(emp => processFor(emp, e => e.email || e.name));
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
              if (!err && goals) goals.forEach(goal => processFor({ id: goal.user_id, name: goal.employee_name, email: goal.email, department: goal.department }, e => e.email || e.name));
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
              if (!err && employees) employees.forEach(emp => processFor(emp, e => e.email || e.name));
            });
          }
        });

        setTimeout(() => {
          Promise.all(allTasks).then(results => resolve({ success: true, results })).catch(() => resolve({ success: true }));
        }, 1500);
      });
    });
  });
}

function runReminders(createdBy) {
  return new Promise((resolve) => {
    db.get(`SELECT active_cycle, created_at FROM cycle_settings ORDER BY id DESC LIMIT 1`, [], (err, activeCycleRow) => {
      if (err || !activeCycleRow) return resolve({ error: 'No active cycle' });

      db.all(`
        SELECT u.id, u.name, u.email, u.department
        FROM users u
        JOIN goals g ON g.user_id = u.id
        WHERE g.status = 'approved' AND g.quarter = ?
        GROUP BY u.id
      `, [activeCycleRow.active_cycle], (err, employees) => {
        if (err) return resolve({ error: 'DB error' });

        const tasks = (employees || []).map(emp => {
          return new Promise(resolveP => {
            db.get(`SELECT 1 FROM checkins c WHERE c.user_id = ? AND c.quarter = ? LIMIT 1`, [emp.id, activeCycleRow.active_cycle], (err2, checkin) => {
              if (err2) return resolveP({ employee: emp.name, error: 'DB error' });
              if (!checkin) {
                notifyEvent({
                  subject: 'Reminder: Complete Quarterly Check-in',
                  message: `Please complete your quarterly check-in for ${activeCycleRow.active_cycle}.`,
                  link: `http://localhost:3000/?tab=checkins`,
                  cardTitle: 'Quarterly Check-in Reminder',
                  cardSubtitle: `Quarter ${activeCycleRow.active_cycle} check-in pending`,
                  recipients: [emp.email]
                }).catch(console.error);

                db.get(`SELECT u.email FROM users u JOIN users e ON e.department = u.department WHERE u.role = 'manager' AND e.id = ? LIMIT 1`, [emp.id], (mgrErr, mgr) => {
                  if (!mgrErr && mgr?.email) {
                    notifyEvent({
                      subject: 'Reminder: Team Member Check-in Missing',
                      message: `${emp.name} has not completed their check-in for ${activeCycleRow.active_cycle}.`,
                      link: `http://localhost:3000/?tab=team`,
                      cardTitle: 'Team Check-in Missing',
                      cardSubtitle: `${emp.name} needs to complete their quarterly update.`,
                      recipients: [mgr.email]
                    }).catch(console.error);
                  }
                  resolveP({ employee: emp.name, reminded: true });
                });
              } else {
                resolveP({ employee: emp.name, reminded: false });
              }
            });
          });
        });

        Promise.all(tasks).then(results => resolve({ success: true, results }));
      });
    });
  });
}

module.exports = { runEscalations, runReminders };
