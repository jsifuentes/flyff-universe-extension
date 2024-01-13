import Log from "../shared/utils/log.js";
import removeDebuggerProtection from "./debugger-protection.js";
import { MemoryWrapper } from "./memory/index.js";
import hookWASMTriggerFunctions from "./wasm-trigger/index.js";

const logger = new Log();
window.wyff = {
    logger,
};

setInterval(() => {
    if (window.wasmMemory !== undefined) {
        window.MemoryWrapper = new MemoryWrapper(wasmMemory);
    }
})

removeDebuggerProtection();
hookWASMTriggerFunctions();