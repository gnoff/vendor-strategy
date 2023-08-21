const Module = require("module");
const path = require("path");

const makeLog = require("@my/log");
const log = makeLog("@my/vendor-self-ref::: ");

const packageExports = require("./exports");

const vendoredFolderPath = path.join(
  require.resolve("@my/vendor-self-ref/package.json"),
  "../vendored"
);

log("installing require hook for vendored packages");

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

  if (packageExports.has(specifierBase)) {
    const exportPath = "." + specifierPath;
    const map = packageExports.get(specifierBase);
    if (map && map[exportPath]) {
      return originalResolveFilename(map[exportPath], parent, isMain, options);
    } else {
      return originalResolveFilename(
        path.join(vendoredFolderPath, request),
        parent,
        isMain,
        options
      );
    }
  }

  return originalResolveFilename(request, parent, isMain, options);
};
