const makeLog = require("@my/log");
const log = makeLog("@my/vend::: ");

log("running index.js");

log("requiring ./require-hook");
require("./require-hook");
