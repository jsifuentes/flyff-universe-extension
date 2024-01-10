import Log from "../shared/utils/log.js";
import removeDebuggerProtection from "./debugger-protection.js";
import hookWASMTriggerFunctions from "./wasm-trigger/index.js";

const logger = new Log();
window.wyff = {
    logger,
};

removeDebuggerProtection();
hookWASMTriggerFunctions();