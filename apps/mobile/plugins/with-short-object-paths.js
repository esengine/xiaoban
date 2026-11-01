const { withAppBuildGradle } = require("expo/config-plugins");

const OBJECT_PATHS = "-DCMAKE_OBJECT_PATH_MAX=258";
const LINT = 'disable "ExtraTranslation"';

module.exports = function withAndroidBuildFixes(config) {
  return withAppBuildGradle(config, (next) => {
    let contents = next.modResults.contents;
    if (!contents.includes(OBJECT_PATHS)) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        (match) =>
          `${match}\n        externalNativeBuild {\n            cmake {\n                arguments "${OBJECT_PATHS}"\n            }\n        }`,
      );
    }
    if (!contents.includes(LINT)) {
      contents = contents.replace(
        /\nandroid\s*\{/,
        (match) => `${match}\n    lint {\n        ${LINT}\n    }`,
      );
    }
    next.modResults.contents = contents;
    return next;
  });
};
