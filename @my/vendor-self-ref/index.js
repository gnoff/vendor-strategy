const makeLog = require("@my/log");
const log = makeLog("@my/vendor-self-ref::: ");

log("running index.js");

log("about to install require-hook");
require("./require-hook.js");
