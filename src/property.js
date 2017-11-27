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
    this.retained = true;

    /**
     * MQTT Quality of Service
     * 0: at most once
     * 1: at least once
     * 2: exactly once
     */
    this.qos = 1;
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

  setQoS(qos) {
    this.qos = qos;
    return this;
  }

  send(value) {
    const { mqttClient } = this.node.device;
    mqttClient.publish(this.topic, value, {
      qos: this.qos,
      retain: this.retained
    });
    this.retained = true;
    return this;
  }
};
