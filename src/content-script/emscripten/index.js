export function __emval_call_void_method(caller, handle, methodName, args) {
    const actualMethodName = getStringOrSymbol(methodName);
    const actualCaller = emval_methodCallers[caller];
    const actualHandle = emval_handles.get(handle);

    // wyff.logger.info(`__emval_call_void_method() intercepted ${actualHandle.value.constructor.name}.${actualMethodName}()`);

    if (actualMethodName === "fillText" || actualMethodName === "strokeText") {
        const dataview = new DataView(wasmMemory.buffer);
        const handleIndex = dataview.getUint8(args);
        wyff.logger.info(`${actualMethodName}() intercepted ${emval_handles.allocated[handleIndex].value}`);
    }

    return window.__emval_call_void_method(caller, handle, methodName, args);
}

export function __emval_call_method(caller, handle, methodName, destructorsRef, args) {
    const actualMethodName = getStringOrSymbol(methodName);
    const actualCaller = emval_methodCallers[caller];
    const actualHandle = emval_handles.get(handle);

    // wyff.logger.info(`__emval_call_method() intercepted ${actualHandle.value.constructor.name}.${actualMethodName}()`);
    return window.__emval_call_method(caller, handle, methodName, destructorsRef, args);
}
