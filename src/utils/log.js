function _now() {
    return new Date().toISOString().replace("T", " ").replace("Z", "");
}

const prefixStyle = [
    "font-size: 1.6em",
    "font-weight: bold",
    "text-transform: uppercase",
].join(";");

export default class Log {
    constructor(infoWriter, debugWriter, errorWriter) {
        this.infoWriter = infoWriter || console.log;
        this.debugWriter = debugWriter || console.debug;
        this.errorWriter = errorWriter || console.error;
    }

    info(...args) {
        this.infoWriter(`%c[WYFF]%c [${_now()}] INFO\t%s`, prefixStyle, "", ...args);
    }

    debug(...args) {
        this.debugWriter(`%c[WYFF]%c [${_now()}] DEBUG\t%s`, prefixStyle, "", ...args);
    }

    error(...args) {
        this.errorWriter(`%c[WYFF]%c [${_now()}] ERROR\t%s`, prefixStyle, "", ...args);
    }
}
