const makeLog = require("@my/log");
const log = makeLog("@my/package-b::: ");

require("client-only");
log("running @my/package-b");
try {
  require("server-only");
} catch (error) {
  if (
    error.message.includes(
      "This module cannot be imported from a Client Component module."
    )
  ) {
    // we expected server-only to error since this is not a server component
  } else {
    throw error;
  }
}
