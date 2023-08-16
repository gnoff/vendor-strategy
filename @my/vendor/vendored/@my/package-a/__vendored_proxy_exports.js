var path = require("path");
console.log("@my/package-a::: running __vendored_proxy_exports.js");
module.exports = {
  ".": require.resolve(path.join("@my/package-a-vendored", ".")),
  "./foo": require.resolve(path.join("@my/package-a-vendored", "./foo")),
};
