const log = require("./log");

require("@strategy/vend");

log("running index.js");

log("acquiring package-a transitive getter");
const getA = require("@my/package-trans-a");

log("acquiring package-b transitive getter");
const getB = require("@my/package-trans-b");

log("requiring @my/package-a");
getA("");

log("requiring @my/package-b");
getB("");

log("requiring @my/package-a/foo");
getA("/foo");

log("requiring @my/package-b/foo");
getB("/foo");

log("requiring @my/package-a/bar");
getA("/bar");

log("requiring @my/package-b/bar");
getB("/bar");
