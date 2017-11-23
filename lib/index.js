"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HomieSetting = exports.HomieNode = exports.Homie = undefined;

var _device = require("./device");

const device = new _device.HomieDevice();
device.runningMode = process.env.HOMIE_RUNNING_MODE;

const Homie = exports.Homie = device;
const HomieNode = exports.HomieNode = (name, type) => device.node(name, type);
const HomieSetting = exports.HomieSetting = (name, description, type) => device.setting(name, description, type);