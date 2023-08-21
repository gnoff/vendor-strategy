const LOG_PREFIX = "test/transitive::: ";

function log(message, ...args) {
  console.log(LOG_PREFIX + message, ...args);
}

module.exports = log;
