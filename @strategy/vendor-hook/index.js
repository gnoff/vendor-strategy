const makeLog = require("@my/log");
const log = makeLog("@strategy/vendor-hook::: ");

log("running index.js");

log("requiring @my/vendor-hook");
require("@my/vendor-hook");
