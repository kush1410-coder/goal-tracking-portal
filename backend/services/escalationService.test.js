process.env.DATABASE_PATH = ':memory:';

jest.mock('../utils/notifications', () => ({
  notifyEvent: jest.fn(() => Promise.resolve())
}));

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = require('../database');
const escalationService = require('./escalationService');
const { notifyEvent } = require('../utils/notifications');

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

beforeEach(async () => {
  // reset database tables for test isolation
  await runSql('DELETE FROM users');
  await runSql('DELETE FROM goals');
  await runSql('DELETE FROM checkins');
  await runSql('DELETE FROM cycle_settings');
  await runSql('DELETE FROM escalation_rules');
  await runSql('DELETE FROM escalation_logs');

  await runSql("INSERT INTO cycle_settings (active_cycle, created_at) VALUES ('Q4-2024', datetime('now', '-5 days'))");
  await runSql(`INSERT INTO escalation_rules (rule_key, description, threshold_days, active) VALUES ('goal_submission', 'Test goal submission', 0, 1)`);
  await runSql(`INSERT INTO escalation_rules (rule_key, description, threshold_days, active) VALUES ('checkin_missing', 'Test checkin missing', 0, 1)`);

  const passwordHash = 'test-hash';
  await runSql('INSERT INTO users (username, password, name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)', ['john', passwordHash, 'John Doe', 'john@example.com', 'employee', 'Sales']);
  await runSql('INSERT INTO users (username, password, name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)', ['sarah', passwordHash, 'Sarah Smith', 'sarah@example.com', 'manager', 'Sales']);
  await runSql('INSERT INTO users (username, password, name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)', ['hr', passwordHash, 'HR User', 'hr@example.com', 'hr', 'All']);
});

afterAll(() => {
  db.close();
});

test('runReminders sends reminders for missing check-ins', async () => {
  const employee = await getSql('SELECT id FROM users WHERE username = ?', ['john']);
  expect(employee).toBeDefined();

  await runSql('INSERT INTO goals (user_id, thrust_area, title, description, uom, target, weightage, status, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [employee.id, 'Sales', 'Revenue Target', 'Hit revenue goal', 'numeric', '1000000', 30, 'approved', 'Q4-2024']);

  const result = await escalationService.runReminders(1);
  expect(result.success).toBe(true);
  expect(result.results.length).toBe(1);
  expect(result.results[0].reminded).toBe(true);
  expect(notifyEvent).toHaveBeenCalled();
});

test('runEscalations creates escalation log entries for missing submission', async () => {
  const result = await escalationService.runEscalations(1);
  expect(result.success).toBe(true);
  expect(result.results.length).toBeGreaterThan(0);

  const log = await getSql('SELECT * FROM escalation_logs WHERE rule_key = ? LIMIT 1', ['goal_submission']);
  if (!log) {
    throw new Error('Expected log to be defined, but it was undefined');
  }
  expect(log).toBeDefined();
  expect(log.details).toContain('notified:employee');
});
