const _ = require('lodash');
const path = require('path');
const { readFile } = require('./files');

module.exports = class Config {
  constructor(configPath) {
    if (!configPath) {
      throw new Error('Please provide a config file.');
    }
    this.configurationFile = path.resolve(process.cwd(), configPath);
  }

  async load() {
    this.configuration = await readFile(this.configurationFile);
  }

  defaults(obj) {
    return _.defaultsDeep(this.configuration, obj);
  }

  get(key, defaultValue) {
    if (key) {
      return _.get(this.configuration, key, defaultValue);
    }
    return this.configuration;
  }

  set(key, value) {
    return _.set(this.configuration, key, value);
  }
};
