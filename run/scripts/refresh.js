const fs = require("node:fs/promises");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));
const { runServer } = require("verdaccio");

async function refreshStrategies() {
  const projectPath = path.join(require.resolve("run"), "../..");

  const { execa } = await import("execa");
  const { default: chalk } = await import("chalk");

  const versionFilePath = path.join(projectPath, "run/global-version");
  const previousVersion = (await fs.readFile(versionFilePath, "utf-8")).trim();
  const parts = previousVersion.split(".");
  parts[2] = (parseInt(parts[2]) + 1).toString();
  const nextVersion = parts.join(".");
  await fs.writeFile(versionFilePath, nextVersion);

  // Start our custom registry
  const verdaccioProcess = execa(
    "pnpm",
    ["verdaccio", "-c", "./registry/config.yaml"],
    {
      all: true,
      cwd: path.join(projectPath, "run"),
    }
  ).pipeAll(path.join(projectPath, "run", "verdaccio.log"));

  const vendorPackagePath = path.join(projectPath, "@my/vendor");
  const myPackagePath = path.join(projectPath, "@my/package");
  const tempPath = path.join(projectPath, "temp");

  const vendoredPackages = ["@my/package-a", "@my/package-b"];

  for (package of vendoredPackages) {
    await vendorPackage(package);
  }

  // create a staging project for vendoring
  try {
    await fs.rm(tempPath, { recursive: true });
  } catch (error) {
    // if the path doesn't exist there is nothing to remove
  }
  await fs.cp(myPackagePath, tempPath, { recursive: true });

  // Inject a tracer console.log so we know when we're using the vendored version
  const indexSource = await fs.readFile(
    path.join(tempPath, "index.js"),
    "utf-8"
  );
  await fs.writeFile(
    path.join(tempPath, "index.js"),
    "console.log('[VENDORED MODE]');\n" + indexSource
  );

  // update the package.json name
  const packageSource = JSON.parse(
    await fs.readFile(path.join(tempPath, "package.json"), "utf-8")
  );
  const vendoredPackageName = packageSource.name + "-vendored";
  packageSource.name = vendoredPackageName;
  packageSource.version = nextVersion;
  await fs.writeFile(
    path.join(tempPath, "package.json"),
    JSON.stringify(packageSource, null, 2)
  );

  // pack the vendored packages
  const { stdout: tarballName, all } = await execa("npm", ["pack"], {
    all: true,
    cwd: tempPath,
  });
  const tarballSourcePath = path.join(tempPath, tarballName);
  try {
    await fs.rm(path.join(vendorPackagePath, "vendored"), {
      recursive: true,
    });
  } catch (error) {
    // vendored path did not exist
  }
  await fs.cp(
    tarballSourcePath,
    path.join(vendorPackagePath, "vendored", vendoredPackageName + ".tgz")
  );

  // remove the temporary vendored package
  await fs.rm(tempPath, { recursive: true });

  // Bump the version of @my/vendor
  await patchAndPublish(vendorPackagePath);

  // Bump the version of @my/package
  await patchAndPublish(myPackagePath);

  // copy the files from the package to the vendored folder inside @my/vendor
  // augment all top leve js files in the package to have a console.log indicating
  // the vendored version is running. then add all the dependnecies of the package to
  // @my/vendor's package.json dependencies so they can be installed when @my/vendor is installed
  async function vendorPackage(packageName) {
    const packagePath = path.join(projectPath, packageName);
    const stem = path.join(packagePath, "..");

    const vendoredPackagePath = path.join(
      vendorPackagePath,
      "vendored",
      packageName
    );
    await fs.cp(packagePath, vendoredPackagePath, {
      recursive: true,
    });

    // update the package.json name
    const packageSource = JSON.parse(
      await fs.readFile(path.join(vendoredPackagePath, "package.json"), "utf-8")
    );
    const vendoredPackageName = packageSource.name + "-vendored";
    packageSource.name = vendoredPackageName;
    packageSource.version = nextVersion;
    await fs.writeFile(
      path.join(tempPath, "package.json"),
      JSON.stringify(packageSource, null, 2)
    );

    // augment all top-level js files
    const files = await fs.readdir(vendoredPackagePath);
    for (let file of files) {
      if (file.endsWith(".js")) {
        const source = await fs.readFile(
          path.join(vendoredPackagePath, file),
          "utf-8"
        );
        await fs.writeFile(
          path.join(vendoredPackagePath, file),
          "console.log('[VENDORED MODE]');\n" + source
        );
      }
    }
  }

  async function patchAndPublish(pkgPath, patchPackageSource) {
    let packageSource = JSON.parse(
      await fs.readFile(path.join(pkgPath, "package.json"), "utf-8")
    );
    packageSource.version = nextVersion;
    if (typeof patchPackage === "function") {
      const result = patchPackage(packageSource);
      if (result) {
        packageSource = result;
      }
    }
    await fs.writeFile(
      path.join(pkgPath, "package.json"),
      JSON.stringify(packageSource, null, 2)
    );

    // publish the indirection package
    try {
      const { all: output } = await execa(
        "npm",
        ["publish", "--registry=http://localhost:4873"],
        {
          all: true,
          cwd: pkgPath,
        }
      );
      await fs.writeFile(path.join(pkgPath, "publish.log"), output);
    } catch (error) {
      const { all: output } = error;
      await fs.writeFile(path.join(pkgPath, "publish.log"), output);
      throw error;
    }
  }

  // EOF
  verdaccioProcess.kill();
  return;

  const strategies = await fs.readdir(path.join(projectPath, "strategies"));
  const updated = [];
  for (const strategy of strategies) {
    const strategyPath = path.join(projectPath, "strategies", strategy);
    await fs.rm(path.join(strategyPath, "vendored"), { recursive: true });
    await fs.mkdir(path.join(strategyPath, "vendored"));
    await fs.copyFile(
      tarballSourcePath,
      path.join(strategyPath, "vendored", packageToVendorName + ".tgz")
    );
    updated.push(strategy);

    console.log("starting", strategy);
    const { all: output } = await execa(
      "npm",
      ["publish", "--registry=http://localhost:4873"],
      {
        all: true,
        cwd: strategyPath,
      }
    );
    console.log("strategy", strategy, output);

    // const { stdout: strategyTarballName } = await execa("npm", ["pack"], {
    //   cwd: strategyPath,
    // });
    // await fs.rename(
    //   path.join(strategyPath, strategyTarballName),
    //   path.join(strategyPath, "strategy.tgz")
    // );
  }

  await fs.rm(tarballSourcePath);

  console.log(chalk.green("Success!"));
  console.log();
  console.log(
    `The following strategy projects have been updated with the latest version of "${packageToVendorName}":`
  );
  for (const update of updated) {
    console.log("   * " + chalk.magenta(update));
  }
  console.log();
  console.log();
}

refreshStrategies();
