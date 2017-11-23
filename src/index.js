import { HomieDevice } from "./device";

const device = new HomieDevice();
device.runningMode = process.env.HOMIE_RUNNING_MODE;

export const Homie = device;
export const HomieNode = (name, type) => device.node(name, type);
export const HomieSetting = (name, description, type) =>
  device.setting(name, description, type);
