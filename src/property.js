exports.HomieProperty = class HomieProperty {
  constructor(node, name) {
    /** Parent node */
    this.node = node;

    /** Name of the property */
    this.name = name;

    /** Setter handler */
    this.setter = null;

    /**
     * MQTT retained value
     */
    this.retained = false;
  }

  onConnect() {
    /** MQTT topic corresponding to this property */
    this.topic = `${this.node.topic}/${this.name}`;
  }

  settable(setter) {
    this.setter = setter.bind(this);
    return this;
  }

  setRetained(retained) {
    this.retained = retained;
    return this;
  }

  send(value) {
    const { mqttClient } = this.node.device;
    mqttClient.publish(this.topic, value, { retain: this.retained });
    this.retained = false;
    return this;
  }
};
