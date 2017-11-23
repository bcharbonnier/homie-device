#!/usr/bin/env node
const { fork } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const chalk = require("chalk");
const program = require("commander");
const prompt = require("prompt");

const pkg = require("../package.json");

const { getMacAddress } = require("../src/utils/network");
const { RUNNING_MODE } = require("../src/device");

const CWD = process.cwd();
const DATA_FOLDER_DATA = "data";
const DATA_FOLDER_HOMIE = "homie";
const DATA_FOLDER = path.join(CWD, DATA_FOLDER_DATA, DATA_FOLDER_HOMIE);
const CONFIG_FILE = path.join(DATA_FOLDER, "config.json");

const DEVICE_PACKAGE = require(path.join(CWD, "package.json"));

const DEFAULT_CONFIG = {
  device_id: `${DEVICE_PACKAGE.name}-${getMacAddress().replace(/:/g, "")}`,
  name: os.hostname(),
  mqtt: {
    host: "127.0.0.1",
    port: 1883,
    auth: false,
    base_topic: "homie"
  },
  ota: {
    enabled: false
  }
};

function hasConfigFile() {
  return fs.existsSync(CONFIG_FILE);
}

function writeConfigFile(data) {
  if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(path.join(CWD, DATA_FOLDER_DATA));
    fs.mkdirSync(path.join(CWD, DATA_FOLDER_DATA, DATA_FOLDER_HOMIE));
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

const ID_SCHEMA = {
  properties: {
    device_id: {
      description: "Id of your device",
      type: "string",
      default: DEFAULT_CONFIG.device_id
    },
    name: {
      description: "Friendly name of your device",
      message: "You have to specify a name",
      type: "string",
      required: true
    }
  }
};

const MQTT_SCHEMA = {
  properties: {
    host: {
      description: "IP or hostname of your MQTT broker",
      type: "string",
      default: DEFAULT_CONFIG.mqtt.host
    },
    port: {
      description: "Port of the MQTT broker",
      type: "integer",
      default: DEFAULT_CONFIG.mqtt.port
    },
    auth: {
      description: "Activate MQTT user authentication",
      type: "boolean",
      default: DEFAULT_CONFIG.mqtt.auth
    },
    username: {
      description: "MQTT username",
      type: "string",
      ask() {
        return prompt.history("auth").value === true;
      }
    },
    password: {
      description: "MQTT password",
      hidden: true,
      type: "string",
      ask() {
        return prompt.history("auth").value === true;
      }
    },
    base_topic: {
      description: "MQTT base topic",
      type: "string",
      pattern: /^[a-z\-]+$/,
      default: DEFAULT_CONFIG.mqtt.base_topic
    }
  }
};

function prepareSettingsSchema(settings) {
  const settingsValues = Object.values(settings);
  const settingsSchema = settingsValues.reduce(
    (schema, setting) => {
      schema.properties[setting.name] = {
        description: setting.description,
        required: !setting.defaultValue
      };

      if (setting.defaultValue) {
        schema.properties[setting.name].default =
          setting.type === "json"
            ? JSON.stringify(setting.defaultValue)
            : setting.defaultValue;
      } else {
        schema.properties[setting.name].message = `${
          setting.name
        } is required, you must provide a value`;
      }

      if (setting.type !== "json") {
        schema.properties[setting.name].type = setting.type;
      } else {
        schema.properties[setting.name].before = value => JSON.parse(value);
      }

      return schema;
    },
    { properties: {} }
  );
  return [settingsValues.length > 0, settingsSchema];
}

function filterConfig(id, mqtt, settings) {
  if (!mqtt.auth) {
    delete mqtt.username;
    delete mqtt.password;
  }
  return Object.assign(id, { mqtt }, { settings });
}

program
  .version(pkg.version)
  .description(
    "Command line tool to manage local Homie device(s) written in JavaScript and running on NodeJS"
  );

program
  .command("start")
  .description("Start your Homie device in standard mode")
  .action(() => {
    if (!hasConfigFile()) {
      console.error(
        `${chalk.red("Missing configuration file")} '${CONFIG_FILE}' not found!`
      );
      process.exit(1);
    }

    process.env.HOMIE_RUNNING_MODE = RUNNING_MODE.STANDARD;

    let child;
    function start(handler) {
      const inst = fork(path.join(CWD, "index.js"), {
        stdio: "inherit"
      });

      inst.on("message", handler);
      return inst;
    }

    function handler({ action }) {
      if (action === "reset") {
        child.kill();
        child = start(handler);
      }
    }

    child = start(handler);
  });

program
  .command("config")
  .option("--force-reset", "Erase any existing configuration file")
  .description(
    "Configure your Homie device by simply answering a few questions"
  )
  .action(env => {
    if (hasConfigFile()) {
      if (env.forceReset) {
        fs.unlinkSync(CONFIG_FILE);
      } else {
        console.warn(
          `${chalk.red("Configuration file has been detected.")}
To create a new one and remove the existing one please use

    homie-node config --force-reset
        `
        );
        process.exit(1);
      }
    }

    // Setting the proper CONFIGURATION running mode
    process.env.HOMIE_RUNNING_MODE = RUNNING_MODE.CONFIGURATION;

    // Loading the user 'device' module to initialize it.
    // Main goal here is to have a hook on live Settings
    require(path.join(CWD, "index.js"));

    // Getting our CLI wrapper which is used require(within user 'device'
    // module. Goal is to read settings require(it
    const { Homie } = require("../lib");

    console.log(chalk.cyan("Take some to configure your Homie device"));

    prompt.message = "";
    prompt.start();
    prompt.get(ID_SCHEMA, (_, id) => {
      prompt.get(MQTT_SCHEMA, (__, mqtt) => {
        const [hasSettings, SETTINGS_SCHEMA] = prepareSettingsSchema(
          Homie.settings
        );

        if (hasSettings) {
          console.log("");
          console.log(chalk.cyan("Your Homie device has some settings"));
          prompt.get(SETTINGS_SCHEMA, (___, settings) => {
            const config = filterConfig(id, mqtt, settings);

            writeConfigFile(config);

            console.log("");
            console.log(
              `${chalk.cyan("Configuration file saved locally")} ${CONFIG_FILE}`
            );
            console.log("");
            console.log(
              `${chalk.yellow(
                "You can now start your device with this command"
              )}

    homie-node start
              `
            );
          });
        }
      });
    });
  });

program.parse(process.argv);
