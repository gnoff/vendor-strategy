const Module = require("module");
const path = require("path");

const makeLog = require("@my/log");
const log = makeLog("@my/vendor-hook::: ");

const packageExports = require("./exports");

const vendoredFolderPath = path.join(
  require.resolve("@my/vendor-hook/package.json"),
  "../vendored"
);

log("installing require hook for vendored packages");

const originalResolveFilename = Module._resolveFilename;

let depth = 0;
Module._resolveFilename = function (request, parent, isMain, options) {
  console.log("deeper ->", ++depth);
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
      console.log("shallower <-", --depth);
      return originalResolveFilename(map[exportPath], parent, isMain, options);
    } else {
      console.log("shallower <-", --depth);
      return originalResolveFilename(
        path.join(vendoredFolderPath, request),
        parent,
        isMain,
        options
      );
    }
  }

  console.log("shallower <-", --depth);
  return originalResolveFilename(request, parent, isMain, options);
};
