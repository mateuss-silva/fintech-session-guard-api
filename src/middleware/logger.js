const morgan = require('morgan');
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

// Middleware to capture response body
const responseBodyCapture = (req, res, next) => {
  // Skip capture for SSE and large market search results to prevent performance lag
  const skipBodyLog = 
    req.path.includes('/stream') || 
    req.path.includes('/market/instruments');

  if (skipBodyLog) {
    return next();
  }

  const oldSend = res.send;
  res.send = function (data) {
    try {
      if (typeof data === 'string') {
        res.locals.responseBody = JSON.parse(data);
      } else {
        res.locals.responseBody = data;
      }
    } catch (e) {
      res.locals.responseBody = data;
    }
    return oldSend.apply(res, arguments);
  };
  next();
};

// Create a custom format string
const format = (tokens, req, res) => {
  const method = tokens['method'](req, res);
  let methodColored = chalk.white.bold(method);
  
  switch (method) {
    case 'GET': methodColored = chalk.blue.bold(method); break;
    case 'POST': methodColored = chalk.green.bold(method); break;
    case 'PUT': methodColored = chalk.yellow.bold(method); break;
    case 'DELETE': methodColored = chalk.red.bold(method); break;
  }

  const url = chalk.white(tokens.url(req, res));
  const statusNum = parseInt(tokens.status(req, res));
  let statusColored = chalk.white.bold(statusNum);
  
  if (statusNum >= 500) statusColored = chalk.red.bold(statusNum);
  else if (statusNum >= 400) statusColored = chalk.yellow.bold(statusNum);
  else if (statusNum >= 300) statusColored = chalk.cyan.bold(statusNum);
  else if (statusNum >= 200) statusColored = chalk.green.bold(statusNum);

  const responseTime = chalk.cyan(`${tokens['response-time'](req, res)}ms`);
  const date = chalk.gray(new Date().toLocaleTimeString());
  const ip = chalk.gray(req.ip);

  // Request Body Logging
  let requestBodyLog = '';
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = sanitizeData(req.body);
    requestBodyLog = chalk.gray(`\n   📥 Req Body: ${JSON.stringify(sanitizedBody)}`);
  }

  // Response Body Logging
  let responseBodyLog = '';
  if (res.locals.responseBody) {
    const sanitizedRes = sanitizeData(res.locals.responseBody);
    // Limit response log size if too large
    let resString = JSON.stringify(sanitizedRes);
    if (resString.length > 500) resString = resString.substring(0, 500) + '... (truncated)';
    responseBodyLog = chalk.gray(`\n   📤 Res Body: ${resString}`);
  }

  return [
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
    requestBodyLog,
    responseBodyLog
  ].join(' ').trim();
};

const loggerMiddleware = [
  responseBodyCapture,
  morgan(format)
];

module.exports = loggerMiddleware;
