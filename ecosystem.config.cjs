module.exports = {
  apps: [
    {
      name: "ingemat",
      script: "app.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "768M",
      kill_timeout: 10000,
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
      error_file: "./data/logs/error.log",
      out_file: "./data/logs/output.log",
      time: true,
    },
  ],
};
