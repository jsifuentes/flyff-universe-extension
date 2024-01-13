import { mergeDeep } from "../../shared/utils/merge";
import instrumentBinary from "../instrument";

function createHookFunction(original) {
    return async function(bufferSource, importObject = {}) {
        wyff.logger.debug("WebAssembly.instantiate() intercepted");

        const instrumentResults = instrumentBinary(bufferSource);
        if (instrumentResults.imports) {
            importObject = mergeDeep(importObject, instrumentResults.imports);
        }

        return original(instrumentResults.binary, importObject);
    };
}

export default function hookInstantiate() {
    const oldFunction = WebAssembly.instantiate;
    const hook = createHookFunction(oldFunction);
    window.WebAssembly.instantiate = hook;
}
