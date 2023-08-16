const Module = require("module");
const path = require("path");

const packagesToVendor = ["@my/package-a", "@my/package-b"];

const vendoredPackages = new Map();

console.log("vendor::: installing require hook for vendored packages");

const vendoredPath = path.join(
  require.resolve("@my/vendor/package.json"),
  "../vendored"
);
for (let package of packagesToVendor) {
  try {
    const resolveTopLevelExports = require(path.join(
      vendoredPath,
      package,
      "__vendored_proxy_exports.js"
    ));
    vendoredPackages.set(
      package,
      new Map(Object.entries(resolveTopLevelExports))
    );
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    // it may not exist and this means the project just uses path resolution
    vendoredPackages.set(package, null);
  }
}

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

  if (vendoredPackages.has(specifierBase)) {
    const exportPath = specifierPath === "" ? "." : specifierPath;
    const map = vendoredPackages.get(specifierBase);
    if (map && map.has(exportPath)) {
      return originalResolveFilename(
        path.join("@my/vendor/vendored", specifierBase, map.get(exportPath)),
        parent,
        isMain,
        options
      );
    } else {
      return originalResolveFilename(
        path.join("@my/vendor/vendored", request),
        parent,
        isMain,
        options
      );
    }
  }

  return originalResolveFilename(request, parent, isMain, options);
};
