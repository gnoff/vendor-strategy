const Module = require("module");
const exportsMap = new Map();

exportsMap.set("@my/package-a", Module.createRequire(require.resolve("../vendored/@my/package-a/___exports.js"))("./___exports.js"));
exportsMap.set("@my/package-b", null);

module.exports = exportsMap;
