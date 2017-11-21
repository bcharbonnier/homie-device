"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getMacAddress = getMacAddress;
exports.getIPAddress = getIPAddress;

var _os = require("os");

const INTERFACES = (0, _os.networkInterfaces)();
const EN0_IPV4 = INTERFACES["en0"].filter(itf => itf.family === "IPv4")[0];

function getMacAddress() {
  return EN0_IPV4["mac"];
}

function getIPAddress() {
  return EN0_IPV4["address"];
}