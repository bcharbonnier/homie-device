const { networkInterfaces } = require("os");

const INTERFACES = networkInterfaces();
const EN0_IPV4 = INTERFACES["en0"].filter(itf => itf.family === "IPv4")[0];

exports.getMacAddress = function() {
  return EN0_IPV4["mac"];
};

exports.getIPAddress = function() {
  return EN0_IPV4["address"];
};
