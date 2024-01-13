async function getSourceBuffer() {
    if (sourceObj instanceof Promise) {
        const res = await sourceObj;
        return res.arrayBuffer()
    } else if (sourceObj instanceof Response) {
        return await sourceObj.arrayBuffer();
    } else {
        throw new Error("Got unexpected object type as first argument to WebAssembly.instantiateStreaming");
    }
}

function createHookFunction(original) {
    return async function(sourceObj, importObject = {}) {
        wyff.logger.debug("WebAssembly.instantiateStreaming() intercepted");
        const buffer = await getSourceBuffer(sourceObj);
        return WebAssembly.instantiate(buffer, importObject);
    };
}

export default function hookInstantiateStreaming() {
    const oldFunction = WebAssembly.instantiateStreaming;
    const hook = createHookFunction(oldFunction);
    window.WebAssembly.instantiateStreaming = hook;
}
