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

const formatMessage = (level, message, context = null) => {
  const date = chalk.gray(new Date().toLocaleTimeString());
  let levelPart = '';
  
  switch (level) {
    case 'info': levelPart = chalk.blue.bold('INFO'); break;
    case 'warn': levelPart = chalk.yellow.bold('WARN'); break;
    case 'error': levelPart = chalk.red.bold('ERROR'); break;
    case 'success': levelPart = chalk.green.bold('SUCCESS'); break;
    case 'debug': levelPart = chalk.magenta.bold('DEBUG'); break;
  }

  let line = `${chalk.dim('│')} ${levelPart.padEnd(10)} ${date} ${message}`;
  
  if (context) {
    if (typeof context === 'object') {
      line += chalk.gray(` ${JSON.stringify(sanitizeData(context))}`);
    } else {
      line += chalk.gray(` ${context}`);
    }
  }
  
  return line;
};

const logger = {
  info: (msg, ctx) => console.log(formatMessage('info', msg, ctx)),
  warn: (msg, ctx) => console.log(formatMessage('warn', msg, ctx)),
  error: (msg, ctx) => console.log(formatMessage('error', msg, ctx)),
  success: (msg, ctx) => console.log(formatMessage('success', msg, ctx)),
  debug: (msg, ctx) => console.log(formatMessage('debug', msg, ctx)),
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

module.exports = { setupLogger, logger };
