const makeLog = require("@my/log");
const log = makeLog("@my/vend::: ");

log("running vendored-paths.js");

module.exports = ["@my/package-b"];
