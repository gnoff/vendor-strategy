const Module = require("module");
const path = require("path");

const makeLog = require("@my/log");
const log = makeLog("@my/vend::: ");
log("installing require hook for vendored packages");

const alias = new Map();

const exportsPackages = require("./vendored-exports");
for (const packageName of exportsPackages) {
  alias.set(packageName, path.join("@my/vend-exports/vendored", packageName));
}
const pathsPackages = require("./vendored-paths");
for (const packageName of pathsPackages) {
  alias.set(packageName, path.join("@my/vend-paths/vendored", packageName));
}

console.log("alias", alias);

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  let slash = request.indexOf("/");
  if (request[0] === "@") {
    slash = request.indexOf("/", slash + 1);
  }

  let specifierBase, specifierPath;
  if (slash === -1) {
    specifierBase = request;
    specifierPath = "";
  } else {
    specifierBase = request.slice(0, slash);
    specifierPath = request.slice(slash);
  }

  if (alias.has(specifierBase)) {
    const pathToResolve = path.join(alias.get(specifierBase), specifierPath);
    console.log("resolving", pathToResolve);
    const resolved = require.resolve(pathToResolve);
    console.log("resolved", resolved);
    return resolved;
  }

  return originalResolveFilename(request, parent, isMain, options);
};
