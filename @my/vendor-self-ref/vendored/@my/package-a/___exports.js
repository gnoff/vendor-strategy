const Module = require("module");
const makeLog = require("@my/log");
const log = makeLog("[VENDORED] @my/vendor-self-ref::: ");
log("running exports/@my/package-a");

module.exports = {
  ".": require.resolve("my-package-a-vendored"),
  "./foo": require.resolve("my-package-a-vendored/foo"),
  "./bar": require.resolve("my-package-a-vendored/bar"),
};
log("module.exports", module.exports);
