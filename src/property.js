import { EventEmitter } from "events";
export class HomieProperty extends EventEmitter {
  /** Name of the property */
  name;

  /** Parent Homie node */
  node;

  /** MQTT topic corresponding to this property */
  topic;

  /** Setter handler */
  setter;

  /**
   * MQTT retained value
   * default: false
   */
  retained = false;

  constructor(node, name) {
    super();
    this.node = node;
    this.name = name;

    this.topic = `${node.topic}/${this.name}`;
  }

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
