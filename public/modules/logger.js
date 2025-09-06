// Centralized logging utility
export class Logger {
  constructor(prefix = '[App]', debug = true) {
    this.prefix = prefix;
    this.debug = debug;
  }

  log(...args) {
    if (this.debug) {
      console.log(this.prefix, ...args);
    }
  }

  error(...args) {
    console.error(this.prefix, ...args);
  }

  warn(...args) {
    console.warn(this.prefix, ...args);
  }
}