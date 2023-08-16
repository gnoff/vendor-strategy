const Module = require("module");

const originalResolveFilename = Module._resolveFilename;

mod._resolveFilename = function (request, parent, isMain, options) {
  const hookResolved = requestMap.get(request);
  if (hookResolved) request = hookResolved;
  return originalResolveFilename.call(mod, request, parent, isMain, options);

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap);
