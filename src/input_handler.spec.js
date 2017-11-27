const { HomieDevice } = require("./device");

let device;
let globalInputHandler;
let nodeInputHandler;
let propHandler;
let node;
let prop;

beforeEach(() => {
  device = new HomieDevice();
  device.config = { device_id: "device" };

  globalInputHandler = jest.fn();
  nodeInputHandler = jest.fn();
  propHandler = jest.fn();
  node = device.node("foo", "foo_type", nodeInputHandler);
  prop = node.advertise("baz").settable(propHandler);
});

it("should only execute global input handler", () => {
  globalInputHandler.mockReturnValue(true);
  device.setGlobalInputHandler(globalInputHandler);

  device.onMessage("homie/device/foo/baz/set", "test");
  expect(globalInputHandler).toHaveBeenCalled();
});

it("should only execute node input handler", () => {
  nodeInputHandler.mockReturnValue(true);
  device.onMessage("homie/device/foo/baz/set", "test");

  expect(nodeInputHandler).toHaveBeenCalled();
  expect(propHandler).not.toHaveBeenCalled();
});

it("should execute both node input handler and prop handler", () => {
  nodeInputHandler.mockReturnValue(false);
  device.onMessage("homie/device/foo/baz/set", "test");

  expect(nodeInputHandler).toHaveBeenCalled();
  expect(propHandler).toHaveBeenCalled();
});

it("should execute all handlers", () => {
  globalInputHandler.mockReturnValue(false);
  nodeInputHandler.mockReturnValue(false);
  device.setGlobalInputHandler(globalInputHandler);

  device.onMessage("homie/device/foo/baz/set", "test");

  expect(globalInputHandler).toHaveBeenCalled();
  expect(nodeInputHandler).toHaveBeenCalled();
  expect(propHandler).toHaveBeenCalled();
});
