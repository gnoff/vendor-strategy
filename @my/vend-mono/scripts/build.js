const fs = require("node:fs/promises");
const path = require("path");

const packagesToVendor = new Set(["@my/package-a", "@my/package-b"]);

async function build(
  projectPath,
  packageName,
  { globalVersion, outdent, getJSFiles, patchPackageSource }
) {
  const packagePath = path.join(projectPath, packageName);

  const exportsPackagePath = path.join(packagePath, "packages/exports");
  const pathsPackagePath = path.join(packagePath, "packages/paths");
  const vendPackagePath = path.join(packagePath, "packages/vend");

  const exportsVendoredPath = path.join(exportsPackagePath, "vendored");
  const pathsVendoredPath = path.join(pathsPackagePath, "vendored");

  const exportsPackageDeps = new Map();
  const pathsPackageDeps = new Map();

  const exportsExportMaps = new Map();

  // Clear @my/vend-exports/vendored
  // Clear @my/vend-paths/vendored
  await cleanDir(exportsVendoredPath);
  await cleanDir(pathsVendoredPath);

  // First we vendor each package to the appropriate host package (exports or paths)
  // We track the dependencies of these vendored packages so we can update the host package
  // to adopt them. We assume there will be no version conflicts. In a more advanced version
  // we could use the most strict version doing some analysis to verify there are no conflicts
  for (let packageToVendor of packagesToVendor) {
    const packageToVendorPath = path.join(projectPath, packageToVendor);

    let packageExports = null;
    await patchPackageSource(packageToVendorPath, async (source) => {
      if (source.exports) {
        // We are vendoring with vend-exports
        packageExports = source.exports;
        if (source.dependencies) {
          for (const dependency in source.dependencies) {
            const dependencyVersion = source.dependencies[dependency];
            if (
              exportsPackageDeps.has(dependency) &&
              exportsPackageDeps.get(dependency) !== dependencyVersion
            ) {
              throw new Error(
                "We are attempting to vendor two packages that rely on the same package but with different versions"
              );
            }
            exportsPackageDeps.set(dependency, dependencyVersion);
          }
        }
      } else {
        // We are vendoring to vend-paths
        if (source.dependencies) {
          for (const dependency in source.dependencies) {
            const dependencyVersion = source.dependencies[dependency];
            if (
              pathsPackageDeps.has(dependency) &&
              pathsPackageDeps.get(dependency) !== dependencyVersion
            ) {
              throw new Error(
                "We are attempting to vendor two packages that rely on the same package but with different versions"
              );
            }
            pathsPackageDeps.set(dependency, dependencyVersion);
          }
        }
      }
    });

    if (packageExports) {
      // copy the package to the exports folder
      const vendoredPackagePath = path.join(
        exportsVendoredPath,
        packageToVendor
      );
      await fs.cp(packageToVendorPath, vendoredPackagePath, {
        recursive: true,
      });
      await patchLoggers(vendoredPackagePath);

      function mapConditionsToVendored(mapping) {
        if (typeof mapping === "string") {
          return `./${path.join("vendored", packageToVendor, mapping)}`;
        } else if (typeof mapping === "object" && mapping !== null) {
          return Object.fromEntries(
            Object.entries(mapping).map(([key, value]) => {
              return [key, mapConditionsToVendored(value)];
            })
          );
        }
        throw new Error(
          "package.json export map values are expected to be strings or condition mapping objects"
        );
      }

      // Add proxies exports to the vend-exports package
      for (let exportsPath in packageExports) {
        const mapping = packageExports[exportsPath];

        const vendoredPath = `./${path.join(
          "vendored",
          packageToVendor,
          exportsPath
        )}`;
        const vendoredMapping = mapConditionsToVendored(mapping);
        exportsExportMaps.set(vendoredPath, vendoredMapping);
      }
    } else {
      // copy the package to the paths folder
      const vendoredPackagePath = path.join(pathsVendoredPath, packageToVendor);
      await fs.cp(packageToVendorPath, vendoredPackagePath, {
        recursive: true,
      });
      await patchLoggers(vendoredPackagePath);
    }
  }

  // Now we update the vend-exports to have the exports mapped and include
  // dependencies of vendored packages
  await patchPackageSource(exportsPackagePath, (source) => {
    source.version = globalVersion;
    source.exports = Object.fromEntries(exportsExportMaps.entries());
    if (source.dependencies == null) {
      source.dependencies = {};
    }
    for (const [dependency, version] of exportsPackageDeps.entries()) {
      source.dependencies[dependency] = version;
    }
    for (const dep in source.dependencies) {
      if (dep.startsWith("@my/")) {
        source.dependencies[dep] = globalVersion;
      }
    }
  });

  // Now we update the vend-paths to include dependencies of vendored packages
  await patchPackageSource(pathsPackagePath, (source) => {
    source.version = globalVersion;
    if (source.dependencies == null) {
      source.dependencies = {};
    }
    for (const [dependency, version] of exportsPackageDeps.entries()) {
      source.dependencies[dependency] = version;
    }
    for (const dep in source.dependencies) {
      if (dep.startsWith("@my/")) {
        source.dependencies[dep] = globalVersion;
      }
    }
  });

  // Finally we update vend package package
  await patchPackageSource(vendPackagePath, (source) => {
    source.version = globalVersion;
    if (source.dependencies == null) {
      source.dependencies = {};
    }
    for (const dep in source.dependencies) {
      if (dep.startsWith("@my/")) {
        source.dependencies[dep] = globalVersion;
      }
    }
  });

  async function patchLoggers(packagePath) {
    const jsFiles = await getJSFiles(packagePath);
    for (let file of jsFiles) {
      const filePath = path.join(packagePath, file);
      const source = await fs.readFile(filePath, "utf-8");
      await fs.writeFile(
        filePath,
        source.replace('makeLog("', 'makeLog("[VENDORED] ')
      );
    }
  }

  // write the exports into package.json

  //   const vendoredPackagePath = await copyPackageToVendExports(packageToVendor);
  //   if (packageExports) {
  //     await writeExportProxy(packageToVendor, packageExports);
  //     addExportsProxyRow(packageToVendor, packageExports);
  //   } else {
  //     addExportsNullRow(packageToVendor);
  //   }
  //   await patchLoggers(vendoredPackagePath);
  // }

  // // Write the export module that the require hook will use to know how to
  // // resolved vendored packages
  // await writeExportsModule();

  // // Now we update the vendor package deps
  // await patchPackageSource(packagePath, (source) => {
  //   source.version = globalVersion;
  //   if (source.dependencies == null) {
  //     source.dependencies = {};
  //   }
  //   for (const [dependency, version] of vendorPackageDeps.entries()) {
  //     source.dependencies[dependency] = version;
  //   }
  // });

  // function getVendoredPackageName(packageName) {
  //   return packageName.replace("@", "").replace("/", "-") + "-vendored";
  // }

  // async function copyPackageToVendor(packageToCopy) {
  //   const packagePath = path.join(projectPath, packageToCopy);
  //   const vendoredPackagePath = path.join(
  //     projectPath,
  //     packageName,
  //     "vendored",
  //     packageToCopy
  //   );

  //   // Try to clear the previous version of this vendored package
  //   try {
  //     await fs.rm(vendoredPackagePath, { recursive: true });
  //   } catch (error) {
  //     // it may not have existed
  //   }

  //   await fs.cp(packagePath, vendoredPackagePath, { recursive: true });

  //   await patchPackageSource(vendoredPackagePath, (source) => {
  //     source.name = getVendoredPackageName(source.name);
  //   });

  //   return vendoredPackagePath;
  // }

  // async function patchLoggers(vendoredPackagePath) {
  //   const jsFiles = await getJSFiles(vendoredPackagePath);
  //   for (let file of jsFiles) {
  //     const filePath = path.join(vendoredPackagePath, file);
  //     const source = await fs.readFile(filePath, "utf-8");
  //     await fs.writeFile(
  //       filePath,
  //       source.replace('makeLog("', 'makeLog("[VENDORED] ')
  //     );
  //   }
  // }

  // async function writeExportProxy(vendoredPackageName, vendoredPackageExports) {
  //   let exportMappings = "";
  //   for (let exportPath in vendoredPackageExports) {
  //     exportMappings += outdent`
  //       ${outdent}
  //         "${exportPath}": exportsRequire.resolve("${exportPath}"),\n
  //     `;
  //   }

  //   let proxySource = outdent`
  //     const Module = require("module");
  //     const makeLog = require("@my/log");
  //     const log = makeLog("${packageName}::: ");
  //     log("running exports/${vendoredPackageName}");

  //     const requireBase = require.resolve(
  //       "${packageName}/vendored/${vendoredPackageName}/package.json"
  //     );
  //     const exportsRequire = Module.createRequire(requireBase);

  //     module.exports = {
  //       ${exportMappings.trim()}
  //     };
  //     log("module.exports", module.exports);\n
  //   `;

  //   const exportsFile = path.join(
  //     packagePath,
  //     "exports",
  //     vendoredPackageName,
  //     "index.js"
  //   );
  //   await fs.writeFile(exportsFile, proxySource);
  // }

  // function addExportsProxyRow(package) {
  //   exportsSourceRows += outdent`
  //     exportsMap.set("${package}", require("./${package}"));\n
  //     `;
  // }

  // function addExportsNullRow(package) {
  //   exportsSourceRows += outdent`
  //     exportsMap.set("${package}", null);\n
  //     `;
  // }

  // async function writeExportsModule() {
  //   let source = outdent`
  //     const exportsMap = new Map();

  //     ${exportsSourceRows.trim()}

  //     module.exports = exportsMap;\n
  //   `;

  //   const filePath = path.join(packagePath, "exports", "index.js");
  //   await fs.writeFile(filePath, source);
  // }

  return;
}

module.exports = build;

async function cleanDir(path) {
  try {
    await fs.rm(path, { recursive: true });
  } catch (error) {
    // it may not have existed
  }
}
