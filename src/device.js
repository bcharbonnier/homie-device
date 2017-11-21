import { EventEmitter } from "events";
import mqtt from "mqtt";

import { HomieNode } from "./node";
import { getMacAddress, getIPAddress } from "./utils/network";

const HOMIE_VERSION = "2.0.0";
const IMPLEMENTATION = "javascript";
const IMPLEMENTATION_VERSION = "1.0";
const BASE_TOPIC = "homie";

/* IP of the device on the local network */
const LOCAL_IP = getIPAddress();
/* MAC_ADDRESS of the device */
const MAC_ADDRESS = getMacAddress();

const DEFAULT_CONFIG = {
  device_id: MAC_ADDRESS.split(":").join(""),
  mqtt: {
    host: "localhost",
    port: 1883,
    base_topic: BASE_TOPIC
  }
};

export class HomieDevice extends EventEmitter {
  /** MQTT client */
  mqttClient;

  /** Interval pointer use to publish stats */
  interval;

  /**
   * Interval at which stats are published
   * default: 60s
   */
  statsInterval = 60;

  /** Firmware information */
  firmwareName = null;
  firmwareVersion = null;

  /** Used to compute the time elapsed in seconds since the boot of the device */
  startTime = Date.now();

  nodes = {};

  constructor(config) {
    super();

    this.onConnect = this.onConnect.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onStats = this.onStats.bind(this);

    this.config = { ...DEFAULT_CONFIG, ...config };

    this.topic = `${this.config.mqtt.base_topic}/${this.config.device_id}`;
  }

  node(name, type) {
    return (this.nodes[name] = new HomieNode(this, name, type));
  }

  setup() {
    const options = {
      will: {
        topic: `${this.topic}/$online`,
        payload: false,
        qos: 0,
        retain: true
      }
    };

    if (this.config.mqtt.username) {
      options["username"] = this.config.mqtt.username;
      if (this.config.mqtt.password) {
        options["password"] = this.config.mqtt.password;
      }
    }

    if (this.firmwareName == null && this.firmwareVersion == null) {
      console.error(
        "You must call `device.setFirmware()` before calling `device.setup()`"
      );
      process.exit(1);
    }

    const mqttServer = `${this.config.mqtt.host}:${this.config.mqtt.port}`;

    this.mqttClient = mqtt.connect(`mqtt://${mqttServer}`, options);

    this.mqttClient.on("connect", this.onConnect);
    this.mqttClient.on("close", this.onDisconnect);
    this.mqttClient.on("message", this.onMessage);

    this.mqttClient.subscribe(`${this.topic}/#`);
    this.mqttClient.subscribe(`${this.config.mqtt.base_topic}/$broadcast/#`);

    console.log(`Connected Homie ${this.topic} to ${mqttServer}`);
  }

  tearDown() {
    this.mqttClient.publish(`${this.topic}/$online`, "false");
    this.mqttClient.end();
  }

  onConnect() {
    // Let's advertise over MQTT all our attributes
    this.mqttClient.publish(`${this.topic}/$homie`, HOMIE_VERSION, {
      retain: true
    });
    this.mqttClient.publish(`${this.topic}/$implementation`, IMPLEMENTATION, {
      retain: true
    });
    this.mqttClient.publish(
      `${this.topic}/$implementation/version`,
      IMPLEMENTATION_VERSION,
      {
        retain: true
      }
    );

    this.mqttClient.publish(`${this.topic}/$name`, this.config.name, {
      retain: true
    });

    this.mqttClient.publish(`${this.topic}/$fw/name`, this.firmwareName, {
      retain: true
    });
    this.mqttClient.publish(`${this.topic}/$fw/version`, this.firmwareVersion, {
      retain: true
    });
    // TODO: missing $fw/checksum here

    this.mqttClient.publish(`${this.topic}/$localip`, LOCAL_IP, {
      retain: true
    });
    this.mqttClient.publish(`${this.topic}/$mac`, MAC_ADDRESS, {
      retain: true
    });

    this.mqttClient.publish(
      `${this.topic}/$stats/interval`,
      `${this.statsInterval}`,
      { retain: true }
    );

    // Let's advertise over MQTT all our nodes
    for (const node of Object.values(this.nodes)) {
      node.onConnect();
    }

    // Last, we are $online
    this.mqttClient.publish(`${this.topic}/$online`, "true", { retain: true });

    this.emit("connected");

    this.onStats();
    this.interval = setInterval(
      () => this.onStats(),
      this.statsInterval * 1000
    );
  }

  onDisconnect() {
    this.interval = clearInterval(this.interval);
    for (const node of this.nodes) {
      node.onDisconnect();
    }
    this.emit("disconnected");
  }

  onStats() {
    const uptime = (Date.now() - this.startTime) / 1000;
    this.mqttClient.publish(
      `${this.topic}/$stats/uptime`,
      Math.max(Math.round(uptime), 0).toString(),
      {
        retain: false
      }
    );
    this.emit("stats", uptime);
  }

  onMessage(topic, message) {
    const [baseTopic, deviceId, ...deviceTopic] = topic.split("/");

    if (deviceId === "$broadcast") {
      this.emit("broadcast", deviceTopic, message);
    }

    this.emit("message", deviceTopic, message);
  }

  setFirmware(name, version) {
    this.firmwareName = name;
    this.firmwareVersion = version;
  }
}
