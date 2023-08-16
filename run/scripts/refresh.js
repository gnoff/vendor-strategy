const fs = require("node:fs/promises");
const path = require("path");
const outdent = require("outdent");
const { getDirectories } = require("./utils/utils.js");
const argv = require("minimist")(process.argv.slice(2));

const packagesToVendor = new Set(["@my/package-a", "@my/package-b"]);

async function refreshStrategies() {
  const projectPath = path.join(require.resolve("run"), "../..");
  const vendorPath = path.join(projectPath, "@my/vendor");

  const { execa } = await import("execa");
  const { default: chalk } = await import("chalk");

  // Start our custom registry
  const verdaccioProcess = execa(
    "pnpm",
    ["verdaccio", "-c", "./registry/config.yaml"],
    {
      all: true,
      cwd: path.join(projectPath, "run"),
    }
  ).pipeAll(path.join(projectPath, "run", "verdaccio.log"));

  await new Promise((res) => {
    setTimeout(res, 4000);
  });

  // Bump global version by 1 patch
  const versionFilePath = path.join(projectPath, "run/global-version");
  const previousVersion = (await fs.readFile(versionFilePath, "utf-8")).trim();
  const parts = previousVersion.split(".");
  parts[2] = (parseInt(parts[2]) + 1).toString();
  const nextVersion = parts.join(".");
  await fs.writeFile(versionFilePath, nextVersion);

  // This will store the dependencies of all the packages we are vendoring
  const vendorPackageDeps = new Map();

  const myScopePackages = (
    await getDirectories(path.join(projectPath, "@my"))
  ).map((name) => "@my/" + name);
  const strategyScopePackages = (
    await getDirectories(path.join(projectPath, "@strategy"))
  ).map((name) => "@strategy/" + name);

  // First we prepare each package by bumping it's version and
  // if vendoring, copying it to the vendored folder and capturing it's dependencies
  for (let package of myScopePackages) {
    const packagePath = path.join(projectPath, package);

    await patchPackageSource(packagePath, async (source) => {
      source.version = nextVersion;

      if (packagesToVendor.has(package)) {
        // capture dependencies of this vendored package to attribute to
        // @my/vendor
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

        // If this package has exports create a __vendored_proxy_exports.js file
        // which will expose resolved exports at runtime using conditions relying
        // on package self resolution to avoid challenges with PnP
        if (source.exports) {
          let proxySource = outdent`
            var path = require("path");
            console.log("${package}::: running __vendored_proxy_exports.js");
            module.exports = {\n
          `;
          for (let exportPath in source.exports) {
            proxySource += outdent`
              ${outdent}
                "${exportPath}": require.resolve(path.join("${package}-vendored", "${exportPath}")),\n
            `;
          }
          proxySource += outdent`
            };\n
          `;
          await fs.writeFile(
            path.join(packagePath, "__vendored_proxy_exports.js"),
            proxySource
          );
        }
      }
    });
    if (packagesToVendor.has(package)) {
      await copyPackageToVendor(package);
    }
  }

  // Now we update the vendor package deps
  await patchPackageSource(vendorPath, (source) => {
    source.version = nextVersion;
    source.dependencies = {};
    for (const [dependency, version] of vendorPackageDeps.entries()) {
      source.dependencies[dependency] = version;
    }
  });

  // Finally we publish each package
  for (let package of myScopePackages) {
    await publish(package);
  }

  // Now we update each strategy version and vendor dep and then publish
  for (let package of strategyScopePackages) {
    const packagePath = path.join(projectPath, package);
    await patchPackageSource(packagePath, (source) => {
      source.version = nextVersion;
      if (!source.dependencies) {
        source.dependencies = {};
      }
      source.dependencies["@my/vendor"] = nextVersion;
    });
    await publish(package);
  }

  async function publish(packageName) {
    const packagePath = path.join(projectPath, packageName);
    try {
      const { all: output } = await execa(
        "npm",
        ["publish", "--registry=http://localhost:4873"],
        {
          all: true,
          cwd: packagePath,
        }
      );
      await fs.writeFile(path.join(packagePath, "publish.log"), output);
    } catch (error) {
      const { all: output } = error;
      await fs.writeFile(path.join(packagePath, "publish.log"), output);
      throw error;
    }
  }

  async function copyPackageToVendor(packageName) {
    const packagePath = path.join(projectPath, packageName);
    const vendoredPackagePath = path.join(
      projectPath,
      "@my/vendor/vendored",
      packageName
    );

    // Try to clear the previous version of this vendored package
    try {
      await fs.rm(vendoredPackagePath, { recursive: true });
    } catch (error) {
      // it may not have existed
    }

    await fs.cp(packagePath, vendoredPackagePath, { recursive: true });

    await patchPackageSource(vendoredPackagePath, (source) => {
      source.name = source.name + "-vendored";
    });

    return vendoredPackagePath;
  }

  async function patchPackageSource(packagePath, patch) {
    const packageSource = JSON.parse(
      await fs.readFile(path.join(packagePath, "package.json"), "utf-8")
    );
    await patch(packageSource);
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify(packageSource, null, 2)
    );
  }

  console.log("killing here");
  // EOF
  verdaccioProcess.kill();
  return;
}

refreshStrategies();
