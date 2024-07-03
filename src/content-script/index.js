import Log from "../utils/log.js";
import RemoveDebuggerProtection from "./hooks/remove-debugger-protection.js";
import HookWasmTriggers from "./hooks/wasm-triggers.js";
import EncryptionInstrument from "./instrumenter/instruments/encryption.js";
import DecryptionInstrument from "./instrumenter/instruments/decryption.js";
import BinaryInstrumenter from "./instrumenter/index.js";
import { MemoryWrapper } from "./memory/index.js";
import HookEmval from "./instrumenter/instruments/hook-emval.js";
// import setCanvasStyles from "./hooks/set-canvas-styles.js";
import WebsocketHooks from "./hooks/websocket.js";
import EmscriptenHooks from "./hooks/emscripten.js";
import MemoryInstrument from "./instrumenter/instruments/memory.js";
// import ResourceFilesInstrument from "./instrumenter/instruments/resource-files.js";

class Wyff {
    constructor() {
        this.logger = new Log();
        this.binaryInstrumenter = new BinaryInstrumenter();
        this.removeDebuggerProtection = new RemoveDebuggerProtection();
        this.hookWasmTriggers = new HookWasmTriggers();
        this.websocketHooks = new WebsocketHooks();
        this.emscriptenHooks = new EmscriptenHooks();

        this.decryptionXorKeyMemoryAddress = null;
        this.decryptionXorKey = null;
        this.encryptionXorKeyMemoryAddress = null;
        this.encryptionXorKey = null;
    }

    init() {
        wyff.logger.info(`initializing wyff`);

        // remove debugger protection
        this.removeDebuggerProtection.do();
        // register our binary instruments
        this._registerInstruments();
        // hook websockets 
        this.websocketHooks.init();
        // hook wasm triggers
        this.hookWasmTriggers.do((...args) => {
            // call hooks when the wasm module is initiating
            this._onWasmInitiating();
            // run our binary instrumenters!
            return this.binaryInstrumenter.run(...args);
        });
    }

    sendFakeMessage(bytes) {
        const ws = this.websocketHooks.getActiveWebsocket();
        const event = new MessageEvent('message', {
            data: new Uint8Array(bytes),
            origin: ws.url.trimEnd('/'),
        });
        ws.onmessage(event);
    }

    _onWasmInitiating() {
        // when wasm is initiating, it is guaranteed that emscripten functions have been 
        // defined. so now we can hook them.

        // also register a post-run hook
        window.addOnPostRun(() => {
            this._onWasmPostRun();
        });
        this.emscriptenHooks.init();
        // setCanvasStyles();
    }

    _onWasmPostRun() {
        wyff.logger.info(`wasm post run`);
        // pull the xor keys
        this.memoryWrapper = new MemoryWrapper(wasmMemory);

        if (this.decryptionXorKeyMemoryAddress) {
            this.decryptionXorKey = this.memoryWrapper.readBytes(this.decryptionXorKeyMemoryAddress, 32);
            wyff.logger.info(`decryption xor key: ${this.decryptionXorKey.join("\t")}`);
        }

        if (this.encryptionXorKeyMemoryAddress) {
            this.encryptionXorKey = this.memoryWrapper.readBytes(this.encryptionXorKeyMemoryAddress, 32);
            wyff.logger.info(`encryption xor key: ${this.encryptionXorKey.join("\t")}`);
        }

    }

    _registerInstruments() {
        this.binaryInstrumenter.add("memory", new MemoryInstrument);
        this.binaryInstrumenter.add("encryption", new EncryptionInstrument);
        this.binaryInstrumenter.add("decryption", new DecryptionInstrument);
        // this.binaryInstrumenter.add("resource_files", new ResourceFilesInstrument);
        this.binaryInstrumenter.add("hook", new HookEmval);
    }
}

window.wyff = new Wyff();
window.wyff.init();
