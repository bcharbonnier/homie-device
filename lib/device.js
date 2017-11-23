"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HomieDevice = exports.RUNNING_MODE = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _events = require("events");

var _mqtt = require("mqtt");

var _mqtt2 = _interopRequireDefault(_mqtt);

var _chalk = require("chalk");

var _chalk2 = _interopRequireDefault(_chalk);

var _node = require("./node");

var _setting = require("./setting");

var _network = require("./utils/network");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const HOMIE_VERSION = "2.0.0";
const IMPLEMENTATION = "javascript";
const IMPLEMENTATION_VERSION = "1.0";
const BASE_TOPIC = "homie";

/* IP of the device on the local network */
const LOCAL_IP = (0, _network.getIPAddress)();
/* MAC_ADDRESS of the device */
const MAC_ADDRESS = (0, _network.getMacAddress)();

const DEFAULT_CONFIG = {
  device_id: MAC_ADDRESS.split(":").join(""),
  mqtt: {
    host: "localhost",
    port: 1883,
    base_topic: BASE_TOPIC
  }
};
const RUNNING_MODE = exports.RUNNING_MODE = {
  CONFIGURATION: "config",
  STANDARD: "standard"
};

class HomieDevice extends _events.EventEmitter {

  /** Used to compute the time elapsed in seconds since the boot of the device */


  /** Firmware information */


  /** Interval pointer use to publish stats */
  constructor(config = {}) {
    super();

    this.statsInterval = 60;
    this.firmwareName = null;
    this.firmwareVersion = null;
    this.startTime = Date.now();
    this.nodes = {};
    this.settings = {};
    this.runningMode = RUNNING_MODE.STANDARD;
    this.onConnect = this.onConnect.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onStats = this.onStats.bind(this);

    this.config = _extends({}, DEFAULT_CONFIG, config, {
      mqtt: _extends({}, DEFAULT_CONFIG.mqtt, config.mqtt)
    });

    this.topic = `${this.config.mqtt.base_topic}/${this.config.device_id}`;
  }

  /**
   * Interval at which stats are published
   * default: 60s
   */

  /** MQTT client */


  node(name, type) {
    return this.nodes[name] = new _node.HomieNode(this, name, type);
  }

  setting(name, description, type) {
    return this.settings[name] = new _setting.HomieSetting(this, name, description, type);
  }

  setup() {
    // Startup check, that Homie devices should be started from the CLI
    if (!process.env.HOMIE_RUNNING_MODE) {
      console.error(`
Starting your Homie device should be done using homie-node CLI.

${_chalk2.default.dim("Command to execute:")}
  npx homie-node start`);
      process.exit(1);
    }

    if (this.runningMode === RUNNING_MODE.STANDARD) {
      const options = {
        will: {
          topic: `${this.topic}/$online`,
          payload: "false",
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
        console.error("You must call `Homie.setFirmware()` before calling `Homie.setup()`");
        process.exit(1);
      }

      const mqttServer = `${this.config.mqtt.host}:${this.config.mqtt.port}`;

      this.mqttClient = _mqtt2.default.connect(`mqtt://${mqttServer}`, options);

      this.mqttClient.on("connect", this.onConnect);
      this.mqttClient.on("close", this.onDisconnect);
      this.mqttClient.on("message", this.onMessage);

      this.mqttClient.subscribe(`${this.topic}/#`);
      this.mqttClient.subscribe(`${this.config.mqtt.base_topic}/$broadcast/#`);

      console.log(`Connected Homie ${this.topic} to ${mqttServer}`);
    } else {
      if (!Object.values(RUNNING_MODE).includes(this.runningMode)) {
        console.error(`Unknown running mode ${this.runningMode}`);
        process.exit(1);
      }
    }
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
    this.mqttClient.publish(`${this.topic}/$implementation/version`, IMPLEMENTATION_VERSION, {
      retain: true
    });
    this.mqttClient.publish(`${this.topic}/$implementation/config`, JSON.stringify(this.config), {
      retain: true
    });

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

    this.mqttClient.publish(`${this.topic}/$stats/interval`, `${this.statsInterval}`, { retain: true });

    // Let's advertise over MQTT all our nodes
    for (const node of Object.values(this.nodes)) {
      node.onConnect();
    }

    // Last, we are $online
    this.mqttClient.publish(`${this.topic}/$online`, "true", { retain: true });

    this.emit("connected");

    this.onStats();
    this.interval = setInterval(() => this.onStats(), this.statsInterval * 1000);
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
    this.mqttClient.publish(`${this.topic}/$stats/uptime`, Math.max(Math.round(uptime), 0).toString(), {
      retain: false
    });
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
exports.HomieDevice = HomieDevice;