const fs = require("node:fs/promises");
const path = require("path");
const outdent = require("outdent");
const {
  getDirectories,
  getJSFiles,
  patchPackageSource,
  cleanDir,
  safeWriteFile,
} = require("./utils/utils.js");
const argv = require("minimist")(process.argv.slice(2));

async function refreshStrategies() {
  const projectPath = path.join(require.resolve("run"), "../..");

  const shouldPublish = argv["publish"] !== false;

  const { execa, $ } = await import("execa");
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
  let globalVersion = previousVersion;
  if (shouldPublish) {
    const parts = previousVersion.split(".");
    parts[2] = (parseInt(parts[2]) + 1).toString();
    globalVersion = parts.join(".");
    await fs.writeFile(versionFilePath, globalVersion);
  }

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

    let packageExports = null;
    const buildScriptPath = path.join(packagePath, "scripts/build.js");
    let hasBuild = false;
    try {
      await fs.stat(buildScriptPath);
      hasBuild = true;
    } catch (error) {
      // no build script
    }

    if (hasBuild) {
      const build = require(buildScriptPath);
      await build(projectPath, package, {
        globalVersion: globalVersion,
        outdent,
        getJSFiles,
        patchPackageSource,
        cleanDir,
        safeWriteFile,
      });
    } else {
      await patchPackageSource(packagePath, async (source) => {
        // Generic build step for packages that don't specify it

        // Update package version to the globalVersion
        source.version = globalVersion;

        // If this package depends on any @my packages the versions should be synced
        if (source.dependencies) {
          for (const dep in source.dependencies) {
            if (dep.startsWith("@my/")) {
              source.dependencies[dep] = globalVersion;
            }
          }
        }
      });
    }
  }

  // Finally we publish each package
  if (shouldPublish) {
    for (let package of myScopePackages) {
      await publish(package);
    }

    // Now we update each strategy version and vendor dep and then publish
    for (let package of strategyScopePackages) {
      const packagePath = path.join(projectPath, package);
      await patchPackageSource(packagePath, (source) => {
        source.version = globalVersion;
        if (source.dependencies) {
          for (const dep in source.dependencies) {
            if (dep.startsWith("@my/")) {
              source.dependencies[dep] = globalVersion;
            }
          }
        }
      });
      await publish(package);
    }
  }

  async function publish(packageName) {
    const packagePath = path.join(projectPath, packageName);

    let hasWorkspaces = false;
    await patchPackageSource(packagePath, (source) => {
      if (source.workspaces) {
        hasWorkspaces = true;
      }
    });

    const $$ = $({
      all: true,
      cwd: packagePath,
    });

    let publishCommand = ["npm", "publish", "--registry=http://localhost:4873"];
    if (hasWorkspaces) {
      publishCommand.push("--workspaces");
    }

    try {
      const { all: output } = await $$`${publishCommand}`;
      await fs.writeFile(path.join(packagePath, "publish.log"), output);
    } catch (error) {
      const { all: output } = error;
      await fs.writeFile(path.join(packagePath, "publish.log"), output);
      throw error;
    }
  }

  verdaccioProcess.kill();
  return;
}

refreshStrategies();
