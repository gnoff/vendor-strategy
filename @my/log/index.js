function makeLog(prefix) {
  return function log(message, ...args) {
    console.log(prefix + message, ...args);
  }
}

module.exports = makeLog;
