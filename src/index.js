const path = require("path");

const { HomieDevice, RUNNING_MODE } = require("./device");

const CWD = process.cwd();
const runningMode = process.env.HOMIE_RUNNING_MODE;

const device = new HomieDevice();
device.runningMode = runningMode;

const { name, version } = require(path.join(CWD, "package.json"));
device.firmwareName = name;
device.firmwareVersion = version;

if (runningMode === RUNNING_MODE.STANDARD) {
  device.config = require(path.join(CWD, "data", "homie", "config.json"));
}

exports.Homie = device;
exports.HomieNode = (name, type) => device.node(name, type);
exports.HomieSetting = (name, description, type) =>
  device.setting(name, description, type);
