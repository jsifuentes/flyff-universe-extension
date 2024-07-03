export default class HookWasmTriggers {
    do(instrumenterCallback) {
        if (typeof instrumenterCallback !== "function") {
            throw new Error("Expected instrumenterCallback to be a function");
        }

        this.instrumenterCallback = instrumenterCallback;

        wyff.logger.info(`hooking WASM functions`);
        // We need to hook into these two functions to capture when the wasm binary is about to be loaded
        // in and parsed by the browser. We can modify the binary before it reaches the browser engine.
        this.hookInstantiate();
        this.hookInstantiateStreaming();
    }

    hookInstantiate() {
        const oldFunction = WebAssembly.instantiate;
        const hook = (bufferSource, importObject = {}) => {
            wyff.logger.debug("WebAssembly.instantiate() intercepted");
            const instrumentResults = this.instrumenterCallback(bufferSource, importObject);
            return oldFunction(instrumentResults.binary, instrumentResults.imports);
        };

        window.WebAssembly.instantiate = hook;
    }

    hookInstantiateStreaming() {
        const hook = async (sourceObj, importObject = {}) => {
            wyff.logger.debug("WebAssembly.instantiateStreaming() intercepted");
            const buffer = await this._getSourceBuffer(sourceObj);
            return WebAssembly.instantiate(buffer, importObject);
        }

        window.WebAssembly.instantiateStreaming = hook;
    }

    async _getSourceBuffer() {
        if (sourceObj instanceof Promise) {
            const res = await sourceObj;
            return res.arrayBuffer()
        } else if (sourceObj instanceof Response) {
            return await sourceObj.arrayBuffer();
        } else {
            throw new Error("Got unexpected object type as first argument to WebAssembly.instantiateStreaming");
        }
    }
}