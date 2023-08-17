const fs = require("node:fs/promises");
const path = require("node:path");

async function getDirectories(path) {
  return (await fs.readdir(path, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

async function getJSFiles(path) {
  return (await fs.readdir(path, { withFileTypes: true }))
    .filter((dirent) => !dirent.isDirectory() && dirent.name.endsWith(".js"))
    .map((dirent) => dirent.name);
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

module.exports = {
  getDirectories,
  getJSFiles,
  patchPackageSource,
  publish,
};
