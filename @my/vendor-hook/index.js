const makeLog = require("@my/log");
const log = makeLog("@my/vendor-hook::: ");

log("running index.js");

log("about to install require-hook");
require("./require-hook.js");
