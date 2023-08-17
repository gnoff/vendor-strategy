const makeLog = require("@my/log");
const log = makeLog("@strategy/vendor-deps::: ");

log("running index.js");

log("requiring @my/vendor-deps");
require("@my/vendor-deps");
