const exportsMap = new Map();

exportsMap.set("@my/package-a", require("./@my/package-a"));
exportsMap.set("@my/package-b", null);

module.exports = exportsMap;
