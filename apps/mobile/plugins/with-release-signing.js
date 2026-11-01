const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "xiaobanRelease";

const BLOCK = `
        ${MARK} {
            storeFile System.getenv("XIAOBAN_UPLOAD_STORE_FILE") ? file(System.getenv("XIAOBAN_UPLOAD_STORE_FILE")) : null
            storePassword System.getenv("XIAOBAN_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("XIAOBAN_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("XIAOBAN_UPLOAD_KEY_PASSWORD")
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (next) => {
    let contents = next.modResults.contents;
    if (!contents.includes(MARK)) {
      contents = contents.replace(/signingConfigs\s*\{/, (match) => `${match}${BLOCK}`);
      contents = contents.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1signingConfig System.getenv("XIAOBAN_UPLOAD_STORE_FILE") ? signingConfigs.${MARK} : signingConfigs.debug`,
      );
    }
    next.modResults.contents = contents;
    return next;
  });
};
