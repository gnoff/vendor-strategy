const log = require("./log");

require("@strategy/vendor-deps-bundled");

log("running index.js");

log("requiring @my/package-a (not a dep of this project)");
require("@my/package-a");

log("requiring @my/package-b (not a dep of this project)");
require("@my/package-b");

log("requiring @my/package-a/foo (not a dep of this project)");
require("@my/package-a/foo");

log("requiring @my/package-b/foo (not a dep of this project)");
require("@my/package-b/foo");

log("requiring @my/package-a/bar");
require("@my/package-a/bar");

log("requiring @my/package-b/bar");
require("@my/package-b/bar");
