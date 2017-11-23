const { EventEmitter } = require("events");

const mqtt = require("mqtt");
const chalk = require("chalk");

const { HomieNode } = require("./node");
const { HomieSetting } = require("./setting");
const { getMacAddress, getIPAddress } = require("./utils/network");

const HOMIE_VERSION = "2.0.0";
const IMPLEMENTATION = "javascript";
const IMPLEMENTATION_VERSION = "1.0";

/* IP of the device on the local network */
const LOCAL_IP = getIPAddress();
/* MAC_ADDRESS of the device */
const MAC_ADDRESS = getMacAddress();

const RUNNING_MODE = (exports.RUNNING_MODE = {
  CONFIGURATION: "config",
  STANDARD: "standard"
});

exports.HomieDevice = class HomieDevice extends EventEmitter {
  constructor() {
    super();

    /** MQTT client */
    this.mqttClient = null;

    /** Interval pointer use to publish stats */
    this.interval = null;

    /**
     * Interval at which stats are published
     * default: 60s
     */
    this.statsInterval = 60;

    /** Firmware information */
    this.firmwareName = null;
    this.firmwareVersion = null;

    /** Used to compute the time elapsed in seconds since the boot of the device */
    this.startTime = Date.now();

    this.nodes = {};
    this.settings = {};

    this.runningMode = RUNNING_MODE.STANDARD;

    this.hasStarted = false;

    this.onConnect = this.onConnect.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onStats = this.onStats.bind(this);
  }

  node(name, type) {
    if (this.hasStarted) {
      console.error(
        chalk.red("You must call HomieNode() before Homie.setup()")
      );
      process.exit(1);
    }
    return (this.nodes[name] = new HomieNode(this, name, type));
  }

  setting(name, description, type) {
    if (this.hasStarted) {
      console.error(
        chalk.red("You must call HomieSetting() before Homie.setup()")
      );
      process.exit(1);
    }
    return (this.settings[name] = new HomieSetting(
      this,
      name,
      description,
      type
    ));
  }

  log(...messages) {
    const prefix = `[${this.config.device_id}]`;
    console.log(
      `${chalk.grey(new Date().toISOString())} ${chalk.cyan(
        prefix
      )} ${messages.join(" ")}`
    );
  }

  setup() {
    // Startup check, that Homie devices should be started require(the CLI
    if (!process.env.HOMIE_RUNNING_MODE) {
      console.error(`
Starting your Homie device should be done using homie-node CLI using this command

  npx homie-node start
  `);
      process.exit(1);
    }

    if (this.runningMode === RUNNING_MODE.STANDARD) {
      this.topic = `${this.config.mqtt.base_topic}/${this.config.device_id}`;

      // Settings value initialization
      Object.values(this.settings).forEach(setting => {
        if (!setting.defaultValue) {
          setting.value = this.config.settings[setting.name];
        }
      });

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
        console.error(
          chalk.red(
            "You must call `Homie.setFirmware()` before calling `Homie.setup()`"
          )
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

      this.hasStarted = true;
      this.log("Starting...");
      this.log(`Homie device connected to MQTT broker on ${mqttServer}`);
    } else {
      if (!Object.values(RUNNING_MODE).includes(this.runningMode)) {
        console.error(chalk.red(`Unknown running mode ${this.runningMode}`));
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
    this.mqttClient.publish(
      `${this.topic}/$implementation/version`,
      IMPLEMENTATION_VERSION,
      {
        retain: true
      }
    );
    this.mqttClient.publish(
      `${this.topic}/$implementation/config`,
      JSON.stringify(this.config),
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

    // Finally, let's go $online!
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

    if (
      deviceTopic[0] == "$implementation" &&
      deviceTopic[1] == "reset" &&
      message.toString() == "true"
    ) {
      this.log("Reset command received. Restarting now...");
      process.send({ action: "reset" });
      return;
    }

    this.emit("message", deviceTopic, message);
    // Emit to listeners of the specific device topic
    this.emit(`message:${deviceTopic}`, message);

    const [nodeName, propName, set] = deviceTopic;
    if (deviceId === this.config.device_id && "set" === set) {
      const node = this.nodes[nodeName];
      if (node) {
        const range = {
          isRange: false,
          index: 0
        };
        const property = node.properties[propName];

        if (
          property &&
          property.setter &&
          typeof property.setter === "function"
        ) {
          property.setter(range, message);
        }
      }
    }
  }

  setFirmware(name, version) {
    this.firmwareName = name;
    this.firmwareVersion = version;
  }
};
