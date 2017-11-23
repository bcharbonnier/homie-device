const { EventEmitter } = require("events");
const { HomieProperty } = require("./property");

exports.HomieNode = class HomieNode extends EventEmitter {
  constructor(device, name, type) {
    super();

    /** Parent Homie device */
    this.device = device;

    /** Name of the node */
    this.name = name;

    /** Type of the node */
    this.type = type;

    this.properties = {};
  }

  advertise(propertyName) {
    return (this.properties[propertyName] = new HomieProperty(
      this,
      propertyName
    ));
  }

  onConnect() {
    const { mqttClient, topic } = this.device;

    /** MQTT topic corresponding to this node */
    this.topic = `${topic}/${this.name}`;

    // Let's advertise over MQTT all our properties
    mqttClient.publish(`${this.topic}/$type`, this.type, { retain: true });

    let advertising = [];
    for (const property of Object.values(this.properties)) {
      const advertisingMessage = property.name;

      if (property.setter) {
        advertisingMessage += ":settable";
      }

      advertising.push(advertisingMessage);

      property.onConnect();
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
};
