const makeLog = require("@my/log");
const log = makeLog("@my/vend::: ");

log("running vendored-exports.js");

module.exports = ["@my/package-a"];
