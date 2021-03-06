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

    /**
     * Firmware information
     *
     * By default, this information is dynamically retrieved
     * from package.json file at startup time,
     * reading name and version.
     * */
    this.firmwareName = null;
    this.firmwareVersion = null;

    /**
     * Unique handler that will handle every changed settable
     * properties for all nodes
     */
    this.globalInputHandler = null;

    this.nodes = {};
    this.settings = {};

    this.runningMode = RUNNING_MODE.STANDARD;

    this.hasStarted = false;

    this.onConnect = this.onConnect.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onStats = this.onStats.bind(this);

    this.log.error = (error) => {
      const prefix = `[${this.config.device_id}]`;
      // eslint-disable-next-line no-console
      console.error(
        `${chalk.red(new Date().toISOString())} ${chalk.red(
          prefix
        )} ${error}`
      );
    };
  }

  node(name, type, handler) {
    if (this.hasStarted) {
      this.log.error(
        chalk.red("You must call HomieNode() before Homie.setup()")
      );
      process.exit(1);
    }
    return (this.nodes[name] = new HomieNode(this, name, type, handler));
  }

  setting(name, description, type) {
    if (this.hasStarted) {
      this.log.error(
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
    // eslint-disable-next-line no-console
    console.log(
      `${chalk.grey(new Date().toISOString())} ${chalk.cyan(
        prefix
      )} ${messages.join(" ")}`
    );
  }

  setup() {
    // Startup check, that Homie devices should be started from the CLI
    if (!process.env.HOMIE_RUNNING_MODE) {
      this.log.error(`
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
        clientId: this.name,
        connectTimeout: 10 * 1000,
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

      const mqttServer = `${this.config.mqtt.host}:${this.config.mqtt.port}`;

      this.mqttClient = mqtt.connect(`mqtt://${mqttServer}`, options);

      this.mqttClient.on("connect", this.onConnect);
      this.mqttClient.on("close", this.onDisconnect);
      this.mqttClient.on("message", this.onMessage);
      this.mqttClient.on("error", error => this.log.error(error));

      this.mqttClient.subscribe(`${this.topic}/#`);
      this.mqttClient.subscribe(`${this.config.mqtt.base_topic}/$broadcast/#`);

      this.hasStarted = true;
      this.log(`Starting Homie device ${LOCAL_IP}, with PID ${process.pid}`);
      this.log(`Connecting to MQTT broker on ${mqttServer}`);
    } else {
      if (!Object.values(RUNNING_MODE).includes(this.runningMode)) {
        this.log.error(chalk.red(`Unknown running mode ${this.runningMode}`));
        process.exit(1);
      }
    }
  }

  tearDown() {
    this.log("Shutting down Homie device");
    this.mqttClient.publish(`${this.topic}/$online`, "false");
    this.mqttClient.end();
  }

  reset() {
    this.log("Reset command. Restarting device now...");
    process.send({ action: "reset" });
  }

  setGlobalInputHandler(handler) {
    this.globalInputHandler = handler;
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
      `${this.topic}/$implementation/platform`,
      process.platform,
      {
        retain: true
      }
    );

    // Configuration, deep copy & let's remove username & password
    const config = JSON.parse(JSON.stringify(this.config));
    delete config.mqtt.username;
    delete config.mqtt.password;
    this.mqttClient.publish(
      `${this.topic}/$implementation/config`,
      JSON.stringify(config),
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
    for (const node of Object.values(this.nodes)) {
      node.onDisconnect();
    }
    this.emit("disconnected");
  }

  onStats() {
    const uptime = Math.round(process.uptime());
    const { rss } = process.memoryUsage();
    this.mqttClient.publish(`${this.topic}/$stats/uptime`, uptime.toString(), {
      retain: false
    });
    this.mqttClient.publish(`${this.topic}/$stats/memory`, rss.toString(), {
      retain: false
    });
    this.emit("stats", { uptime, mem: rss });
  }

  onMessage(topic, message) {
    const [/* baseTopic */, deviceId, ...deviceTopic] = topic.split("/");

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
          const globalLevel =
            this.globalInputHandler &&
            this.globalInputHandler(node, property, range, message);

          const nodeLevel =
            !globalLevel &&
            node.propertyHandler &&
            node.propertyHandler(property, range, message);

          !nodeLevel && property.setter(range, message);
        }
      }
    }
  }
};
