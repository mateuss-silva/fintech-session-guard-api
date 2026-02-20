// Using fastify built-in logger features or simple hooks
const chalk = require('chalk');

/**
 * Sanitizes sensitive fields from an object
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'pin', 'refreshToken', 'accessToken', 'biometricToken', 'token'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.some(sf => key.toLowerCase().includes(sf.toLowerCase()))) {
      sanitized[key] = '********';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  });
  
  return sanitized;
};

// Fastify Hooks for Request/Response Logging
const setupLogger = (fastify) => {
  fastify.addHook('onResponse', (request, reply, done) => {
    const skipBodyLog = 
      request.url.includes('/stream') || 
      request.url.includes('/market/instruments');

    const method = request.method;
    let methodColored = chalk.white.bold(method);
    switch (method) {
      case 'GET': methodColored = chalk.blue.bold(method); break;
      case 'POST': methodColored = chalk.green.bold(method); break;
      case 'PUT': methodColored = chalk.yellow.bold(method); break;
      case 'DELETE': methodColored = chalk.red.bold(method); break;
    }

    const url = chalk.white(request.url);
    const statusNum = reply.statusCode;
    let statusColored = chalk.white.bold(statusNum);
    
    if (statusNum >= 500) statusColored = chalk.red.bold(statusNum);
    else if (statusNum >= 400) statusColored = chalk.yellow.bold(statusNum);
    else if (statusNum >= 300) statusColored = chalk.cyan.bold(statusNum);
    else if (statusNum >= 200) statusColored = chalk.green.bold(statusNum);

    const responseTime = chalk.cyan(`${Math.round(reply.getResponseTime())}ms`);
    const date = chalk.gray(new Date().toLocaleTimeString());
    const ip = chalk.gray(request.ip);

    let requestBodyLog = '';
    if (!skipBodyLog && request.body && Object.keys(request.body).length > 0) {
      const sanitizedBody = sanitizeData(request.body);
      requestBodyLog = chalk.gray(`\n   📥 Req Body: ${JSON.stringify(sanitizedBody)}`);
    }

    // Fastify doesn't easily expose the raw response body in onResponse natively without a custom serializer or hook trick.
    // For simplicity in this migration, we'll log the request and timing here.
    const logLine = [
      chalk.dim('│'),
      chalk.yellow('🌐'),
      date,
      methodColored.padEnd(15),
      url,
      chalk.dim('→'),
      statusColored,
      chalk.dim('in'),
      responseTime,
      chalk.dim('from'),
      ip,
      requestBodyLog
    ].join(' ').trim();

    console.log(logLine);
    done();
  });
};

module.exports = setupLogger;
