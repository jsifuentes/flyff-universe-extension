import addToWindow from "./init/window.js";
import Log from "./utils/log.js";
import hookWasmFunctions from "./wasm-hooks/index.js";

function createLogger() {
    return new Log(
        console.info,
        console.debug,
        console.error,
    )
}

export function main() {
    const logger = createLogger();
    logger.info(`starting up wyff`);

    addToWindow(logger);
    hookWasmFunctions();
}