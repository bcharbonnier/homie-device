import { EventEmitter } from "events";
import { HomieProperty } from "./property";

export class HomieNode extends EventEmitter {
  /** Name of the node */
  name;

  /** Type of the node */
  type;

  /** Parent Homie device */
  device;

  /** MQTT topic corresponding to this node */
  topic;

  properties = {};

  constructor(device, name, type) {
    super();
    this.device = device;
    this.name = name;
    this.type = type;

    this.topic = `${this.device.topic}/${this.name}`;
  }

  advertise(propertyName) {
    return (this.properties[propertyName] = new HomieProperty(
      this,
      propertyName
    ));
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
