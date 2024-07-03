import { mergeDeep } from "../../utils/merge";
import WasmImportFunction from "./defs/wasm-import-function";

export default class BinaryInstrumenter {
    wailParser = null;

    constructor() {
        this.instruments = [];
    }

    add(name, instrument) {
        if (instrument && typeof instrument !== 'object') {
            throw new Error("instrument must be an object");
        }

        this.instruments[name] = instrument;
    }

    run(bufferSource, imports = {}) {
        this.wailParser = new WailParser(bufferSource);

        /**
         * We need to know all of our imports before we start calling
         * our instruments because function indexes shift as we
         * import new functions.
         */
        const { finalImports, newImportRefs } = this._initAndCollectImports(bufferSource, imports);

        // now call each instrument's instrument function
        for (const name in this.instruments) {
            wyff.logger.info(`Running instrument: ${name}`);

            const instrument = this.instruments[name];
            if (typeof instrument.instrument === 'function') {
                instrument.instrument(newImportRefs);
            }
        }

        this.wailParser.parse(); // kicks off everything

        return {
            binary: this.wailParser.write(),
            imports: finalImports,
        };
    }

    _initAndCollectImports(bufferSource, originalImports) {
        let finalImports = originalImports;
        let newImportRefs = {};

        for (const name in this.instruments) {
            const instrument = this.instruments[name];

            instrument.init(this.wailParser, bufferSource, originalImports);

            // what imports are you replacing
            finalImports = mergeDeep(finalImports, instrument.replacedImports);

            // what imports are you creating
            const newImports = instrument.addedImports;
            for (const [name, importDef] of Object.entries(newImports)) {
                newImportRefs[name] = this.addFunctionImport(name, importDef.params, importDef.returnType);

                finalImports[instrument.PARENT_NEW_IMPORTS_KEY] = finalImports[instrument.PARENT_NEW_IMPORTS_KEY] || {};
                finalImports[instrument.PARENT_NEW_IMPORTS_KEY][name] = importDef.callable;
            }
        }

        return { finalImports, newImportRefs };
    }

    addFunctionImport(name, params, returnType) {
        return this.wailParser.addImportEntry({
            moduleStr: "env",
            fieldStr: name,
            kind: "func",
            type: this.wailParser.addTypeEntry({
                form: "func",
                params: params,
                returnType: returnType
            })
        });
    }

    _mergeImports(startingImports = {}, newImportDefs = {}) {
        const newImports = {};
        for (const [name, importDef] of Object.entries(newImportDefs)) {
            newImports[name] = importDef.func;
        }

        return mergeDeep(startingImports, {
            env: newImports
        });
    }
}