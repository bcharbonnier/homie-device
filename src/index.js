const path = require("path");
const { HomieDevice, RUNNING_MODE } = require("./device");

const runningMode = process.env.HOMIE_RUNNING_MODE;

const device = new HomieDevice();
device.runningMode = runningMode;

if (runningMode === RUNNING_MODE.STANDARD) {
  device.config = require(path.join(
    process.cwd(),
    "data",
    "homie",
    "config.json"
  ));
}

exports.Homie = device;
exports.HomieNode = (name, type) => device.node(name, type);
exports.HomieSetting = (name, description, type) =>
  device.setting(name, description, type);
