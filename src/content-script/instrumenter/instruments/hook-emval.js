import { base64ToArrayBuffer } from "../../../utils/base64.js";
import Instrument from "./base.js";

export default class HookEmval extends Instrument {
    init(wailParser, bufferSource, imports) {
        super.init(wailParser, bufferSource, imports);
        // this.hookImport("__emval_get_property", this.emvalGetProperty.bind(this));
        // this.hookImport("__emval_call_method", this.emvalCallMethod.bind(this));
        // this.hookImport("__emval_call_void_method", this.emvalCallVoidMethod.bind(this));
        // this.hookImport("_emscripten_async_wget_data", this.emscriptenAsyncWgetData.bind(this));
        // this.hookImport("_emscripten_memcpy_big", this.emscriptenMemcpyBig.bind(this));
    }

    emvalGetProperty(og, handle, name) {
        const actualHandle = emval_handles.allocated[handle].value;
        const actualName = emval_handles.allocated[name].value;

        wyff.logger.debug(`get property: ${actualHandle.constructor ? actualHandle.constructor.name : typeof actualHandle} -> ${actualName}`);

        // tricking flyff into thinking the game window is smaller than it really is. funsies.
        // if (actualHandle instanceof Window) {
        //     let modifiedValue;
        //     if (actualName === "innerWidth") {
        //         modifiedValue = window.innerWidth - 250;
        //     } else if (actualName === "innerHeight") {
        //         modifiedValue = window.innerHeight - 250;
        //     }

        //     if (typeof modifiedValue !== 'undefined') {
        //         emval_handles.allocated[handle].value = {
        //             [actualName]: modifiedValue,
        //         };

        //         const returnValue = og(handle, name);
        //         emval_handles.allocated[handle].value = actualHandle;
        //         return returnValue;
        //     }
        // }

        return og(handle, name);
    }

    emvalCallMethod(og, caller, handle, name, ...args) {
        wyff.logger.debug(`call method`, args);
        return og(caller, handle, name, ...args);
    }

    emvalCallVoidMethod(og, caller, handle, methodName, args) {
        const actualMethodName = getStringOrSymbol(methodName);
        const actualCaller = emval_methodCallers[caller];
        const actualHandle = emval_handles.get(handle);
    
        wyff.logger.info(`__emval_call_void_method() intercepted ${actualHandle.value.constructor.name}.${actualMethodName}()`);

        // if (actualMethodName === "fillText" || actualMethodName === "strokeText") {
        //     const dataview = new DataView(wasmMemory.buffer);
        //     const handleIndex = dataview.getUint8(args);
        //     wyff.logger.info(`${actualMethodName}() intercepted ${emval_handles.allocated[handleIndex].value}`);
        // }
    
        return og(caller, handle, methodName, args);
    }

    emscriptenAsyncWgetData(og, url, arg, onload, onerror) {
        // if (UTF8ToString(url).indexOf('en.bin') > -1) {
        //     debugger;
        // }

        wyff.logger.info(`_emscripten_async_wget_data() intercepted ${UTF8ToString(url)}`);
        wyff.logger.info(`onload func index: ${onload}`);
        wyff.logger.info(`wasm table thing`, window.getWasmTableEntry(onload));

        return og(url, arg, onload, onerror);
    }

    emscriptenMemcpyBig(og, dest, src, num) {
        // wyff.logger.info(`_emscripten_memcpy_big() intercepted ${dest} ${src} ${num}`);

        const memBeingCopied = new Uint8Array(wasmMemory.buffer, src, num);
        const asciiRepresentation = new TextDecoder("ascii").decode(memBeingCopied);

        // if (asciiRepresentation.indexOf('model') > -1) {
        //     wyff.logger.info(`_emscripten_memcpy_big() intercepted ${asciiRepresentation}`);
        //     debugger;
        // }

        return og(dest, src, num);
    }
}