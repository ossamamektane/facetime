// Adds the "Quick Call" action to the iPhone app (Shortcuts app → use it with Back Tap:
// Settings → Accessibility → Touch → Back Tap). It rings the quick call saved in the app.
const fs = require("fs");
const path = require("path");
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const FILE = "QuickCallIntent.swift";

function withQuickCall(config) {
  // 1. copy the Swift file into the app's folder
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const dir = path.join(cfg.modRequest.platformProjectRoot, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, FILE), path.join(dir, FILE));
      return cfg;
    },
  ]);
  // 2. tell Xcode to build it
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = name + "/" + FILE;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project });
    }
    return cfg;
  });
  return config;
}

module.exports = withQuickCall;
