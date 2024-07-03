import Instrument from "./instrument.js";

export default class NewInstrument extends Instrument {
    init(wailParser, bufferSource, imports) {
        super.init(wailParser, bufferSource, imports);
        // this.addImport(...);
        // this.hookImport(...);
    }

    instrument(importRefs) {
        wyff.logger.info(`hit new instrument`);
        // this.wailParser
    }
}