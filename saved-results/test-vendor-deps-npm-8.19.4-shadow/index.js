const log = require("./log");

require("@strategy/vendor-deps");

log("running index.js");

log("requiring @my/package-a");
require("@my/package-a");

log("requiring @my/package-b");
require("@my/package-b");

log("requiring @my/package-a/foo");
require("@my/package-a/foo");

log("requiring @my/package-b/foo");
require("@my/package-b/foo");

log("requiring @my/package-a/bar");
require("@my/package-a/bar");

log("requiring @my/package-b/bar");
require("@my/package-b/bar");
