const nodemailer = require('nodemailer');

function hasEmailConfig() {
  return process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;
}

async function sendEmailNotification(to, subject, text, html) {
  if (!hasEmailConfig()) {
    console.log('Email notification skipped: missing EMAIL_HOST/EMAIL_USER/EMAIL_PASS', { to, subject });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
    html
  });
}

async function sendTeamsNotification(message) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Teams notification skipped: missing TEAMS_WEBHOOK_URL', message);
    return;
  }

  try {
    const payload = typeof message === 'string' ? { text: message } : message;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Teams notification failed', error);
  }
}

async function notifyEvent({ subject, message, html, recipients = [], link, cardTitle, cardSubtitle }) {
  if (!subject || !message) return;

  if (recipients.length > 0) {
    const emailRecipients = recipients.filter(r => r && r.includes('@'));
    if (emailRecipients.length > 0) {
      const emailBody = link ? `${message}\n\nOpen here: ${link}` : message;
      const emailHtml = html || `<p>${message}</p>${link ? `<p><a href=\"${link}\" target=\"_blank\">Open in portal</a></p>` : ''}`;
      await sendEmailNotification(emailRecipients.join(','), subject, emailBody, emailHtml).catch(err => {
        console.error('Email notification failed', err);
      });
    }
  }

  const teamsPayload = cardTitle ? {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.2',
          body: [
            { type: 'TextBlock', text: cardTitle, weight: 'Bolder', size: 'Medium' },
            { type: 'TextBlock', text: cardSubtitle || message, wrap: true }
          ].filter(Boolean),
          actions: link ? [
            {
              type: 'Action.OpenUrl',
              title: 'Open in Portal',
              url: link
            }
          ] : []
        }
      }
    ]
  } : `${subject}: ${message}`;
  await sendTeamsNotification(teamsPayload);
}

module.exports = {
  sendEmailNotification,
  sendTeamsNotification,
  notifyEvent
};
