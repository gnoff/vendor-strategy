module.exports = function assert(runOutput) {
  let lines = runOutput.split("\n");

  [
    '[VENDORED] @my/package-a::: running @my/package-a with condition "cond"',
    "[VENDORED] @my/package-b::: running @my/package-b",
    '[VENDORED] @my/package-a::: running @my/package-a/foo with condition "cond"',
    "[VENDORED] @my/package-b::: running @my/package-b/foo",
    '[VENDORED] @my/package-a::: running @my/package-a/bar with condition "cond"',
    "[VENDORED] @my/package-b::: running @my/package-b/bar",
    "[VENDORED] @my/package-b::: other a-bar cond",
    "[VENDORED] @my/package-a::: other b-bar",
  ].forEach((expected) => {
    if (!lines.includes(expected)) {
      throw new Error(`Expected "${expected}" but did not find it.`);
    }
  });
};
