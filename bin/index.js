#!/usr/bin/env babel-node --harmony
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const chalk = require("chalk");
const program = require("commander");
const prompt = require("prompt");

const pkg = require("../package.json");

const { getMacAddress } = require("../lib/utils/network");
const { RUNNING_MODE } = require("../lib/device");

const CWD = process.cwd();
const DATA_FOLDER = path.join(CWD, "data", "homie");
const CONFIG_FILE = path.join(DATA_FOLDER, "config.json");

const DEFAULT_CONFIG = {
  device_id: os.hostname(),
  mqtt: {
    host: "127.0.0.1",
    port: 1883,
    auth: false,
    base_topic: "homie/"
  },
  ota: {
    enabled: false
  }
};

function hasConfigFile() {
  return fs.existsSync(CONFIG_FILE);
}

program
  .version(pkg.version)
  .description("Command line tool to manage local Homie device");

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

    const child = spawn("npx", ["babel-node", "index.js"], {
      stdio: "inherit"
    });
  });

program
  .command("config")
  .option("-f, --file <file>", "Existing config file to be used as a base")
  .option("--force-reset", "Erase any existing configuration file")
  .description("Configure your Homie device")
  .action(env => {
    if (hasConfigFile()) {
      if (env.forceReset) {
        fs.unlinkSync(CONFIG_FILE);
      } else {
        console.warn(`${chalk.yellow("Configuration file has been detected.")}
To create a new one & remove the existing one use:

    homie-node config --force-reset`);
        process.exit(1);
      }
    }

    // Setting the proper CONFIGURATION running mode
    process.env.HOMIE_RUNNING_MODE = RUNNING_MODE.CONFIGURATION;

    // Loading the 'device' module to initialize it.
    // Main goal here is to have a hook on live Settings
    require(path.join(process.cwd(), "index.js"));

    // Getting our CLI wrapper to read settings from it
    const { Homie } = require("../lib");

    console.log(chalk.yellow("Take some to configure your Homie device"));
    const idSchema = {
      properties: {
        device_id: {
          description: "Id of your device",
          type: "string",
          default: `homie-${getMacAddress().replace(/:/g, "")}`
        },
        name: {
          description: "Friendly name of your device",
          message: "You have to specify a name",
          type: "string",
          required: true
        }
      }
    };

    const mqttSchema = {
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
          default: DEFAULT_CONFIG.mqtt.base_topic
        }
      }
    };

    prompt.message = "";
    prompt.start();
    prompt.get(idSchema, (_, id) => {
      prompt.get(mqttSchema, (__, mqtt) => {
        const settingsValues = Object.values(Homie.settings);
        const settingsSchema = settingsValues.reduce(
          (schema, setting) => {
            schema.properties[setting.name] = {
              description: setting.description,
              required: !setting.defaultValue,
              default:
                setting.type === "json"
                  ? JSON.stringify(setting.defaultValue)
                  : setting.defaultValue
            };

            if (!setting.defaultValue) {
              schema.properties[setting.name].message = `${
                setting.name
              } is required, you must provide a value`;
            }

            if (setting.type !== "json") {
              schema.properties[setting.name].type = setting.type;
            } else {
              schema.properties[setting.name].before = value =>
                JSON.parse(value);
            }

            return schema;
          },
          { properties: {} }
        );

        if (settingsValues.length) {
          console.log("");
          console.log(chalk.yellow("Your Homie device has some settings"));
          prompt.get(settingsSchema, (err, settings) => {
            if (!mqtt.auth) {
              delete mqtt.username;
              delete mqtt.password;
            }
            const config = Object.assign(id, { mqtt }, { settings });

            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

            console.log("");
            console.log(
              `${chalk.yellow("Configuration file saved locally")} ${
                CONFIG_FILE
              }`
            );
          });
        }
      });
    });
  });

program.parse(process.argv);
