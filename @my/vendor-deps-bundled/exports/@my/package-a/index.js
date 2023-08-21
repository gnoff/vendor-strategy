const Module = require("module");
const makeLog = require("@my/log");
const log = makeLog("@my/vendor-deps-bundled::: ");
log("running exports/@my/package-a");

const requireBase = require.resolve(
  "@my/vendor-deps-bundled/vendored/@my/package-a/package.json"
);
const exportsRequire = Module.createRequire(requireBase);

module.exports = {
  ".": exportsRequire.resolve("my-package-a-vendored"),
  "./foo": exportsRequire.resolve("my-package-a-vendored/foo"),
  "./bar": exportsRequire.resolve("my-package-a-vendored/bar"),
};
log("module.exports", module.exports);
