const fs = require("node:fs/promises");
const path = require("path");

const packagesToVendor = new Set(["@my/package-a", "@my/package-b"]);

async function build(
  projectPath,
  packageName,
  { globalVersion, outdent, getJSFiles, patchPackageSource }
) {
  const packagePath = path.join(projectPath, packageName);
  // This will store the dependencies of all the packages we are vendoring
  const vendorPackageDeps = new Map();

  let exportsSourceRows = "";

  // First we prepare each package by bumping it's version and
  // if vendoring, copying it to the vendored folder and capturing it's dependencies
  for (let package of packagesToVendor) {
    const packagePath = path.join(projectPath, package);

    let packageExports = null;
    await patchPackageSource(packagePath, async (source) => {
      // capture dependencies of this vendored package to attribute to this vendor package
      if (source.dependencies) {
        for (const dependency in source.dependencies) {
          const dependencyVersion = source.dependencies[dependency];
          if (
            vendorPackageDeps.has(dependency) &&
            vendorPackageDeps.get(dependency) !== dependencyVersion
          ) {
            throw new Error(
              "We are attempting to vendor two packages that rely on the same package but with different versions"
            );
          }
          vendorPackageDeps.set(dependency, dependencyVersion);
        }
      }

      if (source.exports) {
        packageExports = source.exports;
      }
    });

    const vendoredPackagePath = await copyPackageToVendor(package);
    if (packageExports) {
      await writeExportProxy(package, packageExports);
      addExportsProxyRow(package, packageExports);
    } else {
      addExportsNullRow(package);
    }
    await patchLoggers(vendoredPackagePath);
  }

  // Write the export module that the require hook will use to know how to
  // resolved vendored packages
  await writeExportsModule();

  // Now we update the vendor package deps
  await patchPackageSource(packagePath, (source) => {
    source.version = globalVersion;
    if (source.dependencies == null) {
      source.dependencies = {};
    }
    for (const [dependency, version] of vendorPackageDeps.entries()) {
      source.dependencies[dependency] = version;
    }
  });

  function getVendoredPackageName(packageName) {
    return packageName.replace("@", "").replace("/", "-") + "-vendored";
  }

  async function copyPackageToVendor(packageToCopy) {
    const packagePath = path.join(projectPath, packageToCopy);
    const vendoredPackagePath = path.join(
      projectPath,
      packageName,
      "vendored",
      packageToCopy
    );

    // Try to clear the previous version of this vendored package
    try {
      await fs.rm(vendoredPackagePath, { recursive: true });
    } catch (error) {
      // it may not have existed
    }

    await fs.cp(packagePath, vendoredPackagePath, { recursive: true });

    await patchPackageSource(vendoredPackagePath, (source) => {
      source.name = getVendoredPackageName(source.name);
    });

    return vendoredPackagePath;
  }

  async function patchLoggers(vendoredPackagePath) {
    const jsFiles = await getJSFiles(vendoredPackagePath);
    for (let file of jsFiles) {
      const filePath = path.join(vendoredPackagePath, file);
      const source = await fs.readFile(filePath, "utf-8");
      await fs.writeFile(
        filePath,
        source.replace('makeLog("', 'makeLog("[VENDORED] ')
      );
    }
  }

  async function writeExportProxy(vendoredPackageName, vendoredPackageExports) {
    let exportMappings = "";
    for (let exportPath in vendoredPackageExports) {
      exportMappings += outdent`
        ${outdent}
          "${exportPath}": exportsRequire.resolve("${path.join(
        getVendoredPackageName(vendoredPackageName),
        exportPath
      )}"),\n
      `;
    }

    let proxySource = outdent`
      const Module = require("module");
      const makeLog = require("@my/log");
      const log = makeLog("${packageName}::: ");
      log("running exports/${vendoredPackageName}");

      const requireBase = require.resolve(
        "${packageName}/vendored/${vendoredPackageName}/package.json"
      );
      const exportsRequire = Module.createRequire(requireBase);
      
      module.exports = {
        ${exportMappings.trim()}
      };
      log("module.exports", module.exports);\n
    `;

    const exportsFile = path.join(
      packagePath,
      "exports",
      vendoredPackageName,
      "index.js"
    );
    await fs.writeFile(exportsFile, proxySource);
  }

  function addExportsProxyRow(package) {
    exportsSourceRows += outdent`
      exportsMap.set("${package}", require("./${package}"));\n
      `;
  }

  function addExportsNullRow(package) {
    exportsSourceRows += outdent`
      exportsMap.set("${package}", null);\n
      `;
  }

  async function writeExportsModule() {
    let source = outdent`
      const exportsMap = new Map();

      ${exportsSourceRows.trim()}

      module.exports = exportsMap;\n
    `;

    const filePath = path.join(packagePath, "exports", "index.js");
    await fs.writeFile(filePath, source);
  }

  return;
}

module.exports = build;
