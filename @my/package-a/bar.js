const makeLog = require("@my/log");
const log = makeLog("@my/package-a::: ");

log("running @my/package-a/bar");

module.exports = "a-bar";

const other = require("@my/package-b/bar");
log("other", other);
