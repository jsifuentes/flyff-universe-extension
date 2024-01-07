import hookInstantiate from "./instantiate.js";
import hookInstantiateStreaming from "./instantiateStreaming.js";

export default function hookWasmFunctions() {
    hookInstantiate();
    hookInstantiateStreaming();
}