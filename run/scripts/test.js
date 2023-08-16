const fs = require("node:fs/promises");
const path = require("path");
const { getDirectories } = require("./utils/utils.js");
const argv = require("minimist")(process.argv.slice(2));

async function runTests() {
  const projectPath = path.join(require.resolve("run"), "../..");
  console.log("projectPath", projectPath);

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

  const allStrategies = await getDirectories(
    path.join(projectPath, "@strategy")
  );

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
    "npm@8.19.4",
    // "npm@9.8.1",
    // "pnpm@7.33.6",
    // "pnpm@8.6.12",
    // "yarn@3.6.1",
    // "yarn@1.22.19",
  ];

  await clearResults();

  const tests = await getDirectories(path.join(projectPath, "tests"));

  for (test of tests) {
    for (const packageManager of packageManagers) {
      for (const strategy of requestedStrategies) {
        await runTest(test, strategy, packageManager);
      }
    }
  }

  if (argv.save === true) {
    await saveResults();
  }

  async function clearResults() {
    try {
      await fs.rm(path.join(projectPath, "results"), { recursive: true });
    } catch (error) {
      // it may not exist
    }
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
      await fs.stat(path.join(projectPath, "@strategy", strategyName));
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

  async function runTest(testName, strategy, packageManager) {
    const testPath = path.join(projectPath, "tests", testName);
    const packageSource = JSON.parse(
      await fs.readFile(
        path.join(projectPath, "tests", testName, "package.json")
      )
    );

    packageSource.packageManager = packageManager;
    if (packageSource.dependencies == null) {
      packageSource.dependencies = {};
    }
    packageSource.dependencies["@strategy/" + strategy] = "latest";
    const folderName = `test-${testName}-${strategy}-${packageManager.replace(
      "@",
      "-"
    )}`;
    packageSource.name = folderName;

    const resultPath = path.join(projectPath, "results", folderName);

    await fs.cp(testPath, resultPath, {
      recursive: true,
    });
    await fs.writeFile(
      path.join(resultPath, "package.json"),
      JSON.stringify(packageSource, null, 2)
    );
    const indexFileString = await fs.readFile(
      path.join(resultPath, "index.js"),
      "utf8"
    );
    await fs.writeFile(
      path.join(resultPath, "index.js"),
      indexFileString.replace(
        "%% REPLACED FOR EACH TEST %%",
        `@strategy/${strategy}`
      )
    );

    let installCommand;
    let runCommand;
    switch (packageManager.slice(0, 3)) {
      case "npm":
        installCommand = [
          "corepack",
          "npm",
          "install",
          "--registry=http://localhost:4873",
        ];
        runCommand = ["node", "index.js"];
        break;
      case "yar":
        installCommand = ["corepack", "yarn", "install"];
        runCommand = ["corepack", "yarn", "node", "index.js"];
        break;
      case "pnp":
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
      cwd: resultPath,
    });

    try {
      // const { all: installOutput } = await $$`corepack ${pmName} install`;
      const { all: installOutput } = await $$`${installCommand}`;
      fs.writeFile(path.join(resultPath, "output_install.txt"), installOutput);
      try {
        const { all: runOutput } = await $$`${runCommand}`;
        fs.writeFile(path.join(resultPath, "output_run.txt"), runOutput);
      } catch (error) {
        const { all: runOutput } = error;
        fs.writeFile(path.join(resultPath, "output_run.txt"), runOutput);
      }
    } catch (error) {
      console.log("error", error);
      const { all: installOutput } = error;
      fs.writeFile(path.join(resultPath, "output_install.txt"), installOutput);
      fs.writeFile(
        path.join(resultPath, "output_run.txt"),
        "<<< Install Failed. Test did not run. >>>"
      );
    }
  }
  verdaccioProcess.kill();
}

runTests();
