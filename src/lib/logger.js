const winston = require('winston');
const chalk = require('chalk');

const environment = process.env.NODE_ENV || 'development';

// Colorise level output
const level = (value) => {
  const uvalue = value.toUpperCase();
  switch (uvalue) {
    case 'SILLY':
    case 'DEBUG':
      return chalk.white(uvalue);
    case 'WARN':
      return chalk.yellow(uvalue);
    case 'ERROR':
      return chalk.red(uvalue);
    default:
      return chalk.blue(uvalue);
  }
};

module.exports = class Logger {
  constructor() {
    const {
      combine, timestamp, printf,
    } = winston.format;

    const myFormat = printf((info) => `${info.timestamp} [${level(info.level)}][${chalk.red(environment.toUpperCase())}] ${info.level === 'error' && info.stack ? info.stack : info.message}`);

    // Winston logger
    const logger = winston.createLogger({
      transports: [
        new winston.transports.Console({
          level: process.env.LOG_LEVEL || (environment === 'production' ? 'info' : 'debug'),
          handleExceptions: true,
          humanReadableUnhandledException: true,
          json: false,
          colorize: false,
        }),
      ],
      format: combine(
        timestamp(),
        myFormat,
      ),
    });

    return logger;
  }
};
