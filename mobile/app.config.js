const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => ({
  ...config,
  name: isDevelopment ? "Krumer Dev" : config.name,
  displayName: isDevelopment ? "Krumer Dev" : config.displayName,
  android: {
    ...config.android,
    package: isDevelopment
      ? "com.adriantinoco.krumer.dev"
      : config.android.package,
  },
});
