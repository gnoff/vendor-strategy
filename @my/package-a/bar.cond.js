const makeLog = require("@my/log");
const log = makeLog("@my/package-a::: ");

log('running @my/package-a/bar with condition "cond"');

module.exports = "a-bar cond";

const other = require("@my/package-b/bar");
log("other", other);
