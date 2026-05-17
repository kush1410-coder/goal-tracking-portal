const path = require('path');
const app = require('./app');
const escalationService = require('./services/escalationService');
const config = require('./config');
const cron = require('node-cron');

const PORT = config.port || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});

// Schedule daily escalation and reminders at 02:00 server time
try {
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled escalation and reminder jobs');
    try {
      await escalationService.runEscalations(0);
      await escalationService.runReminders(0);
      console.log('Scheduled jobs completed');
    } catch (e) {
      console.error('Scheduled job error', e);
    }
  });
  console.log('Scheduler initialized: daily jobs at 02:00');
} catch (e) {
  console.warn('Scheduler not initialized', e);
}

module.exports = server;

// Schedule daily escalation and reminders at 02:00 server time
try {
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled escalation and reminder jobs');
    try {
      await escalationService.runEscalations(0);
      await escalationService.runReminders(0);
      console.log('Scheduled jobs completed');
    } catch (e) {
      console.error('Scheduled job error', e);
    }
  });
  console.log('Scheduler initialized: daily jobs at 02:00');
} catch (e) {
  console.warn('Scheduler not initialized', e);
}