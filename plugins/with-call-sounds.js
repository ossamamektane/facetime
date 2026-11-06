// Puts a silent ringtone inside the app (fc-quiet.caf). When you pick your own ringtone, the app plays
// it itself and the iPhone call screen rings with this silent sound, so you never hear two at once.
const fs = require("fs");
const path = require("path");
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const FILE = "fc-quiet.caf";

function withCallSounds(config) {
  // 1. copy the sound into the app's folder
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
  // 2. tell Xcode to put it inside the app
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = name + "/" + FILE;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: name, project, isBuildFile: true });
    }
    return cfg;
  });
  return config;
}

module.exports = withCallSounds;
