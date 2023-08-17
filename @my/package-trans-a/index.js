const makeLog = require("@my/log");
const log = makeLog("@my/package-trans-a::: ");

log("running @my/package-trans-a");

function proxyToPackage(specifier) {
  return require("@my/package-a" + specifier);
}

module.exports = proxyToPackage;
