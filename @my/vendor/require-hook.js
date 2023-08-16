const Module = require("module");

const originalResolveFilename = Module._resolveFilename;

mod._resolveFilename = function (request, parent, isMain, options) {
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

  switch (specifierBase) {
    case "@my/package-a":
    case "@my/package-b": {
      return originalResolveFilename(
        "@my/vendor/vendored/" + specifierBase.split("/")[1] + specifierPath,
        parent,
        isMain,
        options
      );
    }
  }

  return originalResolveFilename(request, parent, isMain, options);

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap);
