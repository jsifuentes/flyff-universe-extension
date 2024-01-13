import hookInstantiate from "./instantiate.js";
import hookInstantiateStreaming from "./instantiateStreaming.js";

export default function hookWASMTriggerFunctions() {
    wyff.logger.info(`hooking WASM functions`);

    // We need to hook into these two functions to capture when the wasm binary is about to be loaded
    // in and parsed by the browser. We can modify the binary before it reaches the browser engine.
    //
    // These hooks end up calling the instrumentBinary() function
    hookInstantiate();
    hookInstantiateStreaming();
}