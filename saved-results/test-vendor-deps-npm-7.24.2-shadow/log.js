const LOG_PREFIX = "test/no-shadow::: ";

function log(message, ...args) {
  console.log(LOG_PREFIX + message, ...args);
}

module.exports = log;
