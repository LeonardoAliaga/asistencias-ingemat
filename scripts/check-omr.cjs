const { checkRuntime } = require("../src/services/omr-runtime.service");
checkRuntime().then((report) => {
  process.exitCode = report.ok ? 0 : 1;
});
