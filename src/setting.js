export class HomieSetting {
  value;
  defaultValue;

  constructor(device, name, description, type) {
    this.device = device;
    this.name = name;
    this.description = description;
    this.type = type;
  }

  setDefaultValue(value) {
    this.defaultValue = value;
    return this;
  }

  setValidator(validator) {
    this.validator = validator;
    return this;
  }

  get() {
    return this.value || this.defaultValue;
  }

  set(value) {
    if (this.validator(value)) {
      this.value = value;
    }
  }
}
