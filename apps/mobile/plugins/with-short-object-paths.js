const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "-DCMAKE_OBJECT_PATH_MAX=128";

module.exports = function withShortObjectPaths(config) {
  return withAppBuildGradle(config, (next) => {
    if (next.modResults.contents.includes(MARK)) return next;
    next.modResults.contents = next.modResults.contents.replace(
      /defaultConfig\s*\{/,
      (match) =>
        `${match}\n        externalNativeBuild {\n            cmake {\n                arguments "${MARK}"\n            }\n        }`,
    );
    return next;
  });
};
