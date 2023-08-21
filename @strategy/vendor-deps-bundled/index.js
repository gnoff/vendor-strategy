const makeLog = require("@my/log");
const log = makeLog("@strategy/vendor-deps-bundled::: ");

log("running index.js");

log("requiring @my/vendor-deps-bundled");
require("@my/vendor-deps-bundled");
