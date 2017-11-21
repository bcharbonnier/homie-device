"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HomieNode = undefined;

var _events = require("events");

var _property = require("./property");

class HomieNode extends _events.EventEmitter {

  /** MQTT topic corresponding to this node */


  /** Type of the node */
  constructor(device, name, type) {
    super();
    this.properties = {};
    this.device = device;
    this.name = name;
    this.type = type;

    this.topic = `${this.device.topic}/${this.name}`;
  }

  /** Parent Homie device */

  /** Name of the node */


  advertise(propertyName) {
    return this.properties[propertyName] = new _property.HomieProperty(this, propertyName);
  }

  onConnect() {
    const { mqttClient } = this.device;

    // Let's advertise over MQTT all our properties
    mqttClient.publish(`${this.topic}/$type`, this.type, { retain: true });

    let advertising = [];
    for (const property of Object.values(this.properties)) {
      const advertisingMessage = property.name;

      if (property.setter) {
        advertisingMessage += ":settable";
      }

      advertising.push(advertisingMessage);
    }
    mqttClient.publish(`${this.topic}/$properties`, advertising.join(","), {
      retain: true
    });
    this.emit("connected");
  }

  onDisconnect() {
    this.emit("disconnected");
  }

  setProperty(propertyName) {
    return this.properties[propertyName];
  }
}
exports.HomieNode = HomieNode;