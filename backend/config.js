const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  serverHost: process.env.SERVER_HOST || `http://localhost:${process.env.PORT || 3000}`,
  sessionSecret: process.env.SESSION_SECRET || 'goal-tracking-secret-key',
  email: {
    host: process.env.EMAIL_HOST || '',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || ''
  },
  teamsWebhook: process.env.TEAMS_WEBHOOK_URL || ''
};
