function createHookFunction(original) {
    return function(inObject, importObject = {}) {
        wyff.info("WebAssembly.instantiate() intercepted");

        // let memoryInstance = null;
        // let memoryDescriptor;

        // let instrumentedBuffer;
        // let instrumentedSymbols;
        // let instrumentedObject;

        // // If WebAssembly.instantiate() receives a WebAssembly.Module object, we should already have
        // // instrumented the binary in webAssemblyModuleProxy()
        // // We should also have attached the "memory" and "symbols" objects to the module so that we
        // // can reach them here.
        // if (inObject instanceof WebAssembly.Module) {
        //     if (typeof inObject.__cetus_env === "undefined") {
        //         colorError("WebAssembly.instantiate() received an un-instrumented WebAssembly.Module. This is most likely a bug!");
        //         return oldWebAssemblyInstantiate(inObject, importObject);
        //     }

        //     memoryDescriptor    = inObject.__cetus_env.memory;
        //     instrumentedSymbols = inObject.__cetus_env.symbols;
        //     instrumentedBuffer  = inObject.__cetus_env.buffer;

        //     exportsInstance     = WebAssembly.Module.exports(inObject);

        //     instrumentedObject = inObject;
        // }
        // else {
        //     const bufferSource = inObject;

        //     const instrumentResults = instrumentBinary(bufferSource);

        //     memoryDescriptor = instrumentResults.memory;
        //     instrumentedBuffer = instrumentResults.buffer;
        //     instrumentedSymbols = instrumentResults.symbols;

        //     instrumentedObject = instrumentedBuffer;
        // }

        // if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "import") {
        //     memoryInstance = getMemoryFromObject(importObject, memoryDescriptor);
        // }

        // // Emscripten by default stores most of the environment in importObject.env
        // // If it doesn't exist already let's create it so we have a place to put 
        // // our imported functions
        // if (typeof importObject.env !== "object") {
        //     importObject.env = {};
        // }

        // importObject.env.readWatchCallback = readWatchCallback;
        // importObject.env.writeWatchCallback = writeWatchCallback;

        // return new Promise(function(resolve, reject) {
        //     oldWebAssemblyInstantiate(instrumentedObject, importObject).then(function(instanceObject) {
        //         let instance = instanceObject;

        //         if (typeof instanceObject.instance !== "undefined") {
        //             instance = instanceObject.instance;
        //         }

        //         if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "export") {
        //             let exportObject = instance.exports;

        //             if (typeof exportObject !== "object") {
        //                 colorError("WebAssembly.instantiate() failed to retrieve export object for instantiated module");
        //             }

        //             memoryInstance = getMemoryFromObject(exportObject, memoryDescriptor);
        //         }

        //         if (!(memoryInstance instanceof WebAssembly.Memory)) {
        //             colorError("WebAssembly.instantiate() failed to retrieve a WebAssembly.Memory object");
        //         }

        //         const cetusIdentifier = cetusInstances.reserveIdentifier();

        //         const watchpointExports = [];

        //         for (let i = 0; i < cetusOptions.wpCount; i++) {
        //             watchpointExports.push(instance.exports["configWatch" + i]);
        //         }

        //         cetusInstances.newInstance(cetusIdentifier, {
        //             memory: memoryInstance,
        //             watchpointExports: watchpointExports,
        //             buffer: instrumentedBuffer,
        //             symbols: instrumentedSymbols
        //         });

        //         resolve(instanceObject);
        //     });
        // });
    };
}

export default function hookInstantiateStreaming() {
    const oldFunction = WebAssembly.instantiateStreaming;
    const hook = createHookFunction(oldFunction);
    window.WebAssembly.instantiateStreaming = hook;
}
