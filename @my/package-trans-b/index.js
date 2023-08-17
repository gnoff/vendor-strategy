const makeLog = require("@my/log");
const log = makeLog("@my/package-trans-b::: ");

log("running @my/package-trans-b");

function proxyToPackage(specifier) {
  return require("@my/package-b" + specifier);
}

module.exports = proxyToPackage;
