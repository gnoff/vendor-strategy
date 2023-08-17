const makeLog = require("@my/log");
const log = makeLog("@my/package-b::: ");

log("running @my/package-b/bar");

module.exports = "b-bar";

const other = require("@my/package-a/bar");
log("other", other);
