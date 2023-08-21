const fs = require("node:fs/promises");
const path = require("path");
const { getDirectories } = require("./utils/utils.js");
const { request } = require("node:http");
const argv = require("minimist")(process.argv.slice(2));

async function runTests() {
  const projectPath = path.join(require.resolve("run"), "../..");

  const versionFilePath = path.join(projectPath, "run/global-version");
  const currentVersion = (await fs.readFile(versionFilePath, "utf-8")).trim();

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

  // Give verdaccio time to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const allStrategies = await getDirectories(
    path.join(projectPath, "@strategy")
  );

  const allTests = await getDirectories(path.join(projectPath, "tests"));

  // For each strategy we will clone the test
  let allPackageManagers = [
    "npm@7.24.2",
    "npm@8.19.4",
    // "npm@9.8.1",
    "pnpm@7.33.6",
    "pnpm@8.6.12",
    "yarn@3.6.1",
    "yarn@1.22.19",
  ];

  let requestedStrategies, requestedTests, requestedPackageManagers;
  if (argv._.length === 0) {
    requestedStrategies = allStrategies;
    requestedTests = allTests;
    requestedPackageManagers = allPackageManagers;
  } else {
    requestedStrategies = [];
    requestedTests = [];
    const pmSet = new Set();
    for (arg of argv._) {
      let validated = false;
      if (allStrategies.includes(arg)) {
        validated = true;
        requestedStrategies.push(arg);
      }
      if (allTests.includes(arg)) {
        validated = true;
        requestedTests.push(arg);
      }
      for (let pm of allPackageManagers.filter((pm) => pm.startsWith(arg))) {
        validated = true;
        pmSet.add(pm);
      }
      if (!validated) {
        existOnInvalidStrategyOrTest(arg);
      }
    }
    if (requestedStrategies.length === 0) {
      requestedStrategies = allStrategies;
    }
    if (requestedTests.length === 0) {
      requestedTests = allTests;
    }
    if (pmSet.size === 0) {
      requestedPackageManagers = allPackageManagers;
    } else {
      requestedPackageManagers = [...pmSet];
    }
  }

  await clearResults();

  let runs = [];

  for (const strategy of requestedStrategies) {
    for (const packageManager of requestedPackageManagers) {
      for (test of requestedTests) {
        await runTest(test, strategy, packageManager);
      }
    }

    summarizeStrategy(strategy);
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

  function existOnInvalidStrategyOrTest(strategyOrTest) {
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

  async function runTest(testName, strategy, packageManager) {
    console.log("running test", testName, strategy, packageManager);
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
    for (let dep in packageSource.dependencies) {
      if (dep.startsWith("@my/")) {
        packageSource.dependencies[dep] = currentVersion;
      }
    }
    const pName = packageManager.replace("@", "-");
    const folderName = `test-${strategy}-${pName}-${testName}`;
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
        "%% STRATEGY PLACEHOLDER %%",
        `@strategy/${strategy}`
      )
    );

    let conditions;
    try {
      conditions = (
        await fs.readFile(path.join(testPath, "conditions"), "utf-8")
      )
        .split("\n")
        .filter(Boolean)
        .map((condition) => "-C\n" + condition)
        .join("\n")
        .split("\n");
    } catch (error) {
      conditions = [];
    }

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
        runCommand = ["node", ...conditions, "index.js"];
        break;
      case "yar":
        installCommand = ["corepack", "yarn", "install"];
        runCommand = ["corepack", "yarn", "node", ...conditions, "index.js"];
        break;
      case "pnp":
        installCommand = [
          "corepack",
          "pnpm",
          "up",
          "&&",
          "corepack",
          "pnpm",
          "install",
          "--registry=http://localhost:4873",
        ];
        runCommand = ["node", ...conditions, "index.js"];
        break;
    }

    const $$ = $({
      all: true,
      cwd: resultPath,
    });

    let installOutput, runOutput;

    try {
      const result = await $$`${installCommand}`;
      installOutput = result.all;
      fs.writeFile(
        path.join(resultPath, "output_install.log"),
        "> " + result.command + "\n" + installOutput
      );
      try {
        const result = await $$`${runCommand}`;
        runOutput = result.all;
        fs.writeFile(
          path.join(resultPath, "output_run.log"),
          "> " + result.command + "\n" + runOutput
        );
        try {
          require(path.join(resultPath, "assert.js"))(runOutput);
          captureSuccess(test, strategy, packageManager);
        } catch (assertionError) {
          captureFailure(test, strategy, packageManager, assertionError);
        }
      } catch (error) {
        const { all: runOutput } = error;
        fs.writeFile(
          path.join(resultPath, "output_run.log"),
          "> " + error.command + "\n" + runOutput
        );
        captureFailure(
          test,
          strategy,
          packageManager,
          `Run Failed: check ${path.relative(
            projectPath,
            resultPath
          )}/output_run.log for more details`
        );
      }
    } catch (error) {
      installOutput = error.all;
      fs.writeFile(
        path.join(resultPath, "output_install.log"),
        "> " + error.command + "\n" + installOutput
      );
      fs.writeFile(
        path.join(resultPath, "output_run.log"),
        "<<< Install Failed. Test did not run. >>>"
      );
      captureFailure(
        test,
        strategy,
        packageManager,
        `Install Failed: check ${path.relative(
          projectPath,
          resultPath
        )}/output_install.log for more details`
      );
    }
  }

  function captureSuccess(test, strategy, packageManager) {
    runs.push({
      success: true,
      badge: chalk.bgGreen.black("SUCCESS"),
      test,
      strategy,
      packageManager,
    });
  }

  function captureFailure(test, strategy, packageManager, loggable) {
    runs.push({
      success: false,
      badge: chalk.bgRed.black("FAILED") + " ",
      test,
      strategy,
      packageManager,
      message: loggable,
    });
  }

  function summarizeStrategy(strategyName) {
    console.log();
    console.log("Test Results: ", chalk.magenta(strategyName));
    console.log();
    let someFailed = false;
    for (const run of runs) {
      const { success, badge, test, strategy, packageManager, message } = run;
      if (success === false) {
        someFailed = true;
      }
      console.log(
        `  *  ${badge} ${run.packageManager} ${run.strategy} ${run.test}`
      );
      if (message) {
        console.log("             " + chalk.gray(message));
      }
    }
    console.log();
    if (someFailed) {
      console.log(chalk.red("Some tests failed"));
    } else {
      console.log(chalk.green("All tests passed"));
    }
    console.log();
    console.log();
    runs = [];
  }

  verdaccioProcess.kill();
}

runTests();
