const fs = require("node:fs/promises");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));

async function runTests() {
  const projectPath = path.join(require.resolve("run"), "../..");

  const { execa, $ } = await import("execa");
  const { default: chalk } = await import("chalk");

  const verdaccioProcess = execa(
    "pnpm",
    ["verdaccio", "-c", "./registry/config.yaml"],
    {
      all: true,
      cwd: path.join(projectPath, "run"),
    }
  ).pipeAll(path.join(projectPath, "run", "verdaccio.log"));

  const allStrategies = await fs.readdir(path.join(projectPath, "strategies"));

  let requestedStrategies;
  if (argv._.length === 0) {
    requestedStrategies = allStrategies;
  } else {
    for (requestedStrategy of argv._) {
      await isValidStrategy(requestedStrategy);
    }
    requestedStrategies = argv._;
  }
  Object.freeze(requestedStrategies);

  // For each strategy we will clone the test
  let packageManagers = [
    // "npm@7.24.2",
    // "npm@8.19.4",
    // "npm@9.8.1",
    // "pnpm@7.33.6",
    // "pnpm@8.6.12",
    "yarn@3.6.1",
    "yarn@1.22.19",
  ];

  const testPackageSource = JSON.parse(
    await fs.readFile(path.join(projectPath, "test-package/package.json"))
  );

  await clearResults();

  for (const packageManager of packageManagers) {
    for (const strategy of requestedStrategies) {
      await runTest(strategy, packageManager, testPackageSource);
    }
  }

  if (argv.save === true) {
    await saveResults();
  }

  async function clearResults() {
    await fs.rm(path.join(projectPath, "results"), { recursive: true });
    await fs.mkdir(path.join(projectPath, "results"));
  }

  async function saveResults() {
    await fs.rm(path.join(projectPath, "saved-results"), { recursive: true });
    await fs.cp(
      path.resolve(projectPath, "results"),
      path.resolve(projectPath, "saved-results"),
      { recursive: true }
    );
  }

  async function isValidStrategy(strategyName) {
    try {
      await fs.stat(path.join(projectPath, "strategies", strategyName));
    } catch (error) {
      console.log(
        chalk.red("You are trying to test a strategy that does not exist: ") +
          chalk.red.bold('"' + strategyName + '"')
      );
      console.log();
      console.log("Try one or more of these strategies:");
      for (const strategy of allStrategies) {
        console.log("   * " + chalk.magenta(strategy));
      }
      console.log();
      console.log();
      process.exit(1);
    }
  }

  async function runTest(strategy, packageManager, packageSource) {
    packageSource.packageManager = packageManager;
    if (packageSource.dependencies == null) {
      packageSource.dependencies = {};
    }
    const folderName = `test-${strategy}-${packageManager.replace("@", "-")}`;
    packageSource.name = folderName;

    const testPath = path.join(projectPath, "results", folderName);

    await fs.cp(path.join(projectPath, "test-package"), testPath, {
      recursive: true,
    });
    await fs.writeFile(
      path.join(testPath, "package.json"),
      JSON.stringify(packageSource, null, 2)
    );
    const indexFileString = await fs.readFile(
      path.join(testPath, "index.js"),
      "utf8"
    );
    await fs.writeFile(
      path.join(testPath, "index.js"),
      indexFileString.replace(
        "%% REPLACED FOR EACH TEST %%",
        `@strategy/${strategy}`
      )
    );

    let installPackage;
    let installCommand;
    let runCommand;
    switch (packageManager.slice(0, 3)) {
      case "npm":
        installPackage = [
          "corepack",
          "npm",
          "install",
          `@strategy/${strategy}`,
          "--registry=http://localhost:4873",
        ];
        installCommand = [
          "corepack",
          "npm",
          "install",
          "--registry=http://localhost:4873",
        ];
        runCommand = ["node", "index.js"];
        break;
      case "yar":
        installPackage = [
          "corepack",
          "yarn",
          "add",
          `@strategy/${strategy}@1.0.0`,
        ];
        installCommand = ["corepack", "yarn", "install"];
        runCommand = ["corepack", "yarn", "node", "index.js"];
        break;
      case "pnp":
        installPackage = [
          "corepack",
          "pnpm",
          "add",
          `@strategy/${strategy}`,
          "--registry=http://localhost:4873",
        ];
        installCommand = [
          "corepack",
          "pnpm",
          "install",
          "--registry=http://localhost:4873",
        ];
        runCommand = ["node", "index.js"];
        break;
    }

    const $$ = $({
      all: true,
      cwd: testPath,
    });

    try {
      // const { all: installOutput } = await $$`corepack ${pmName} install`;
      const { all: installOutput } = await $$`${installPackage}`;
      fs.writeFile(path.join(testPath, "output_install.txt"), installOutput);
      try {
        const { all: runOutput } = await $$`${runCommand}`;
        fs.writeFile(path.join(testPath, "output_run.txt"), runOutput);
      } catch (error) {
        const { all: runOutput } = error;
        fs.writeFile(path.join(testPath, "output_run.txt"), runOutput);
      }
    } catch (error) {
      console.log("error", error);
      const { all: installOutput } = error;
      fs.writeFile(path.join(testPath, "output_install.txt"), installOutput);
      fs.writeFile(
        path.join(testPath, "output_run.txt"),
        "<<< Install Failed. Test did not run. >>>"
      );
    }
  }
  verdaccioProcess.kill();
}

runTests();
