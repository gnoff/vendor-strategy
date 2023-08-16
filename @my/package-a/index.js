require("client-only");
console.log("running @my/package-a");
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
