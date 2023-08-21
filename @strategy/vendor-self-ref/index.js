const makeLog = require("@my/log");
const log = makeLog("@strategy/vendor-self-ref::: ");

log("running index.js");

log("requiring @my/vendor-self-ref");
require("@my/vendor-self-ref");
