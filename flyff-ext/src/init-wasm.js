const oldWebAssemblyInstantiate = WebAssembly.instantiate;

const webAssemblyInstantiateHook = function(inObject, importObject = {}) {
    colorLog("WebAssembly.instantiate() intercepted");

    let memoryInstance = null;
    let memoryDescriptor;

    let instrumentedBuffer;
    let instrumentedSymbols;
    let instrumentedObject;

    // If WebAssembly.instantiate() receives a WebAssembly.Module object, we should already have
    // instrumented the binary in webAssemblyModuleProxy()
    // We should also have attached the "memory" and "symbols" objects to the module so that we
    // can reach them here.
    if (inObject instanceof WebAssembly.Module) {
        if (typeof inObject.__cetus_env === "undefined") {
            colorError("WebAssembly.instantiate() received an un-instrumented WebAssembly.Module. This is most likely a bug!");
            return oldWebAssemblyInstantiate(inObject, importObject);
        }

        memoryDescriptor    = inObject.__cetus_env.memory;
        instrumentedSymbols = inObject.__cetus_env.symbols;
        instrumentedBuffer  = inObject.__cetus_env.buffer;

        exportsInstance     = WebAssembly.Module.exports(inObject);

        instrumentedObject = inObject;
    }
    else {
        const bufferSource = inObject;

        const instrumentResults = instrumentBinary(bufferSource);

        memoryDescriptor = instrumentResults.memory;
        instrumentedBuffer = instrumentResults.buffer;
        instrumentedSymbols = instrumentResults.symbols;

        instrumentedObject = instrumentedBuffer;
    }

    if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "import") {
        memoryInstance = getMemoryFromObject(importObject, memoryDescriptor);
    }

    // Emscripten by default stores most of the environment in importObject.env
    // If it doesn't exist already let's create it so we have a place to put 
    // our imported functions
    if (typeof importObject.env !== "object") {
        importObject.env = {};
    }

    importObject.env.readWatchCallback = readWatchCallback;
    importObject.env.writeWatchCallback = writeWatchCallback;

    return new Promise(function(resolve, reject) {
        oldWebAssemblyInstantiate(instrumentedObject, importObject).then(function(instanceObject) {
            let instance = instanceObject;

            if (typeof instanceObject.instance !== "undefined") {
                instance = instanceObject.instance;
            }

            if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "export") {
                let exportObject = instance.exports;

                if (typeof exportObject !== "object") {
                    colorError("WebAssembly.instantiate() failed to retrieve export object for instantiated module");
                }

                memoryInstance = getMemoryFromObject(exportObject, memoryDescriptor);
            }

            if (!(memoryInstance instanceof WebAssembly.Memory)) {
                colorError("WebAssembly.instantiate() failed to retrieve a WebAssembly.Memory object");
            }

            const cetusIdentifier = cetusInstances.reserveIdentifier();

            const watchpointExports = [];

            for (let i = 0; i < cetusOptions.wpCount; i++) {
                watchpointExports.push(instance.exports["configWatch" + i]);
            }

            cetusInstances.newInstance(cetusIdentifier, {
                memory: memoryInstance,
                watchpointExports: watchpointExports,
                buffer: instrumentedBuffer,
                symbols: instrumentedSymbols
            });

            resolve(instanceObject);
        });
    });
};

window.WebAssembly.instantiate = webAssemblyInstantiateHook;

const webAssemblyModuleProxy = new Proxy(WebAssembly.Module, {
    construct: function(target, args) {
        colorLog("WebAssembly.Module() intercepted");

        const bufferSource = args[0];

        const instrumentResults = instrumentBinary(bufferSource);

        const instrumentedBuffer = instrumentResults.buffer;
        const instrumentedSymbols = instrumentResults.symbols;

        const result = new target(instrumentedBuffer);

        // WebAssembly.Module is typically followed up by an instantiation of
        // WebAssembly.Instance with the resulting Module object.
        // We save the instrumentation results from WAIL so that WebAssembly.Instance
        // can access them.
        result._instrumentResults = instrumentResults;

        return result;
    }
});

window.WebAssembly.Module = webAssemblyModuleProxy;

const webAssemblyInstanceProxy = new Proxy(WebAssembly.Instance, {
    construct: function(target, args) {
        colorLog("WebAssembly.Instance() intercepted");

        const module = args[0];
        const importObject = args[1] || {};

        // If this module was intercepted through an instantiation of WebAssembly.Module,
        // it should have its instrumentsResults object attached to it
        const instrumentResults = module._instrumentResults;

        let memoryInstance = null;

        if (typeof instrumentResults.memory !== "undefined") {
            const memoryModule = instrumentResults.memory.module;
            const memoryField = instrumentResults.memory.field;

            if (typeof memoryModule === "string" && typeof memoryField === "string") {
                memoryInstance = importObject[memoryModule][memoryField];
            }
        }

        // Emscripten by default stores most of the environment in importObject.env
        // If it doesn't exist already let's create it so we have a place to put 
        // our imported functions
        if (typeof importObject.env !== "object") {
            importObject.env = {};
        }

        importObject.env.readWatchCallback = readWatchCallback;
        importObject.env.writeWatchCallback = writeWatchCallback;

        const result = new target(module, importObject);

        const cetusIdentifier = cetusInstances.reserveIdentifier();

        const watchpointExports = [];

        for (let i = 0; i < cetusOptions.wpCount; i++) {
            watchpointExports.push(result.exports["configWatch" + i]);
        }

        cetusInstances.newInstance(cetusIdentifier, {
            memory: memoryInstance,
            watchpointExports: watchpointExports,
            buffer: instrumentResults.instrumentedBuffer,
            symbols: instrumentResults.instrumentedSymbols
        });

        return result;
    }
});

window.WebAssembly.Instance = webAssemblyInstanceProxy;

const oldWebAssemblyInstantiateStreaming = WebAssembly.instantiateStreaming;

const webAssemblyInstantiateStreamingHook = function(sourceObj, importObject = {}) {
    colorLog("WebAssembly.instantiateStreaming() intercepted");

    // TODO In the future we should retrieve the memory object by parsing the IMPORT/EXPORT
    // sections of the binary. But for now this is pretty reliable
    let memoryInstance = null;

    // Some older versions of emscripten use importObject.a instead of importObject.env.
    // Simply link importObject.a to importObject.env if importObject.a exists
    if (typeof importObject.a !== "undefined" && typeof importObject.env === "undefined") {
        importObject.env = importObject.a;
    }

    // Emscripten by default stores most of the environment in importObject.env
    // If it doesn't exist already let's create it so we have a place to put 
    // our imported functions
    if (typeof importObject.env === "undefined") {
        importObject.env = {};
    }

    const cetusIdentifier = cetusInstances.reserveIdentifier();

    importObject.env.readWatchCallback = function() { readWatchCallback.call(null, arguments); };
    importObject.env.writeWatchCallback = function() { writeWatchCallback.call(null, arguments); };

    const wail = new WailParser();

    return new Promise(function(resolve, reject) {
        const handleBuffer = function(bufferSource) {
            if (typeof cetusCallbacks === "object" && typeof cetusCallbacks.preinstantiate === "object") {
                const preinstantiateCallbacks = cetusCallbacks.preinstantiate;

                for (let i = 0; i < preinstantiateCallbacks.length; i++) {
                    const thisFunc = new Function("module", "importObject", preinstantiateCallbacks[i]);

                    thisFunc(bufferSource, importObject);
                }
            }

            const instrumentResults = instrumentBinary(bufferSource);

            const instrumentedBuffer = instrumentResults.buffer;
            const instrumentedSymbols = instrumentResults.symbols;

            const memoryDescriptor = instrumentResults.memory;

            if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "import") {
                memoryInstance = getMemoryFromObject(importObject, memoryDescriptor);
            }

            oldWebAssemblyInstantiate(instrumentedBuffer, importObject).then(function(instanceObject) {
                if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "export") {
                    memoryInstance = getMemoryFromObject(instanceObject.instance.exports, memoryDescriptor);
                }

                if (!(memoryInstance instanceof WebAssembly.Memory)) {
                    colorError("WebAssembly.instantiateStreaming() failed to retrieve a WebAssembly.Memory object");
                }

                const watchpointExports = [];

                for (let i = 0; i < cetusOptions.wpCount; i++) {
                    watchpointExports.push(instanceObject.instance.exports["configWatch" + i]);
                }

                cetusInstances.newInstance(cetusIdentifier, {
                    memory: memoryInstance,
                    watchpointExports: watchpointExports,
                    buffer: instrumentedBuffer,
                    symbols: instrumentedSymbols
                });

                resolve(instanceObject);
            });
        }

        if (sourceObj instanceof Promise) {
            sourceObj.then((res) => res.arrayBuffer()).then((bufferSource) => {
                handleBuffer(bufferSource);
            });
        }
        else if (sourceObj instanceof Response) {
            sourceObj.arrayBuffer().then((bufferSource) => {
                handleBuffer(bufferSource);
            });
        }
        else {
            colorError("Got unexpected object type as first argument to WebAssembly.instantiateStreaming");
        }
    });
};

window.WebAssembly.instantiateStreaming = webAssemblyInstantiateStreamingHook;

const oldWebAssemblyCompile = WebAssembly.compile;

const webAssemblyCompileHook = function(bufferSource) {
    colorLog("WebAssembly.compile() intercepted");

    const instrumentResults = instrumentBinary(bufferSource);
    const instrumentedBuffer = instrumentResults.buffer;

    return new Promise(function(resolve, reject) {
        oldWebAssemblyCompile(instrumentedBuffer).then(function(moduleObject) {
            // Store these values in the module object so that WebAssembly.Instantiate can access them
            moduleObject.__cetus_env = {
                buffer: instrumentedBuffer,
                memory: instrumentResults.memory,
                symbols: instrumentResults.symbols,
            };

            resolve(moduleObject);
        });
    });
}

window.WebAssembly.compile = webAssemblyCompileHook;

const oldWebAssemblyCompileStreaming = WebAssembly.compileStreaming;

const webAssemblyCompileStreamingHook = function(source) {
    colorError("WebAssembly.compileStreaming() not implemented!");

    return oldWebAssemblyCompileStreaming(source);
}

window.WebAssembly.compileStreaming = webAssemblyCompileStreamingHook;
