"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HomieProperty = undefined;

var _events = require("events");

class HomieProperty extends _events.EventEmitter {

  /** Setter handler */


  /** Parent Homie node */
  constructor(node, name) {
    super();
    this.retained = false;
    this.node = node;
    this.name = name;

    this.topic = `${node.topic}/${this.name}`;
  }

  /**
   * MQTT retained value
   * default: false
   */


  /** MQTT topic corresponding to this property */

  /** Name of the property */


  settable(setter) {
    this.setter = setter.bind(this);
    return this;
  }

  setRetained(retain) {
    this.retain = retain;
    return this;
  }

  send(value) {
    const { mqttClient } = this.node.device;
    mqttClient.publish(this.topic, value, { retain: this.retained });
    return this;
  }
}
exports.HomieProperty = HomieProperty;