const fs = require("node:fs/promises");

async function getDirectories(path) {
  return (await fs.readdir(path, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

module.exports = {
  getDirectories,
};
