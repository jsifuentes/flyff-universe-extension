import hookInstantiate from "./instantiate.js";
import hookInstantiateStreaming from "./instantiateStreaming.js";

export default function hookWASMTriggerFunctions() {
    wyff.logger.info(`hooking WASM functions`);
    hookInstantiate();
    hookInstantiateStreaming();
}