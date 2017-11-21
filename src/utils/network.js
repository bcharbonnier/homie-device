import { networkInterfaces } from "os";

const INTERFACES = networkInterfaces();
const EN0_IPV4 = INTERFACES["en0"].filter(itf => itf.family === "IPv4")[0];

export function getMacAddress() {
  return EN0_IPV4["mac"];
}

export function getIPAddress() {
  return EN0_IPV4["address"];
}
