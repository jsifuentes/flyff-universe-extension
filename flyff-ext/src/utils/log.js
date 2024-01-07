export default class Log {
    constructor(infoWriter, debugWriter, errorWriter) {
        this.infoWriter = infoWriter;
        this.debugWriter = debugWriter;
        this.errorWriter = errorWriter;
    }

    info(msg) {
        return this.infoWriter(msg);
    }

    debug(msg) {
        return this.debugWriter(msg);
    }

    error(msg) {
        return this.errorWriter(msg);
    }
}
