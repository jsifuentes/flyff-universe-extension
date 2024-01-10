export default class Log {
    constructor(infoWriter, debugWriter, errorWriter) {
        this.infoWriter = infoWriter || console.log;
        this.debugWriter = debugWriter || console.debug;
        this.errorWriter = errorWriter || console.error;

        const prefixStyle = [
            "font-size: 1.6em",
            "font-weight: bold",
            "text-transform: uppercase",
        ].join(";");

        this.info = this.infoWriter.bind(console, "%c[WYFF]%c INFO\t%s", prefixStyle, "");
        this.debug = this.debugWriter.bind(console, "%c[WYFF]%c DEBUG\t%s", prefixStyle, "");
        this.error = this.errorWriter.bind(console, "%c[WYFF]%c ERROR\t%s", prefixStyle, "");
    }
}
