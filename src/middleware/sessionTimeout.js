const { queryOne, runSql } = require('../config/database');

const TIMEOUT_MINUTES = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '15', 10);

/**
 * Session timeout middleware
 * Checks if the session has been inactive for longer than the configured timeout
 * Updates last_activity on each valid request
 */
async function checkSessionTimeout(req, reply) {
  if (!req.user || !req.user.sessionId) {
    return;
  }

  const session = queryOne('SELECT * FROM sessions WHERE id = ? AND is_active = 1', [req.user.sessionId]);

  if (!session) {
    return reply.code(401).send({
      error: 'SESSION_INVALID',
      message: 'Session not found or inactive',
    });
  }

  const lastActivity = new Date(session.last_activity).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastActivity) / (1000 * 60);

  if (diffMinutes > TIMEOUT_MINUTES) {
    runSql('UPDATE sessions SET is_active = 0 WHERE id = ?', [session.id]);

    return reply.code(401).send({
      error: 'SESSION_EXPIRED',
      message: `Session expired after ${TIMEOUT_MINUTES} minutes of inactivity`,
      code: 'SESSION_EXPIRED',
    });
  }

  // Update last activity
  runSql('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
}

module.exports = { checkSessionTimeout };
