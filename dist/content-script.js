/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/content-script/hooks/emscripten.js":
/*!************************************************!*\
  !*** ./src/content-script/hooks/emscripten.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ EmscriptenHooks)
/* harmony export */ });
function insertIntoString(main_string, ins_string = '', pos = 0) {
    return main_string.slice(0, pos) + ins_string + main_string.slice(pos);
}

class EmscriptenHooks {

    init() {
        this._hookNewFunc();
        this._hookAsyncLoad();
        // this._hookBrowserObj();
    }

    _hookNewFunc() {
        const original = window.newFunc;

        window.wyff.callMethodCallback = function(handle, name, args) {
            wyff.logger.debug(`got ${handle.constructor.name}->${name}(${args.join(',')})`);
        }

        window.newFunc = function(constructor, argumentList) {
            if (constructor.name === 'Function') {
                const functionBodyIndex = argumentList.length - 1;
                const functionBody = argumentList[functionBodyIndex];
                const matchArguments = functionBody.match(/var arg[0-9]+/) || [];
                const findReturnIndex = functionBody.indexOf('var rv ='); // find the moment when the handle() is about to be called.
                const argString = [];
                for (let i = 0; i < matchArguments.length; i++) {
                    argString.push(`arg${i}`);
                }

                if (argString.length > 1) {
                    const newFunctionBody = insertIntoString(functionBody, `
                    window.wyff.callMethodCallback(handle, name, [${argString.join(',')}]);
                    `, findReturnIndex);

                    argumentList[functionBodyIndex] = newFunctionBody;
                }
            }

            return original(constructor, argumentList);
        }
    }

    _hookAsyncLoad() {
        const original = window.asyncLoad;
        window.asyncLoad = function(url, onload, onerror, noRunDep) {
            if (url.indexOf('screenfwc.bin') > -1) {
                const originalOnload = onload;
                onload = function(...args) {
                    wyff.logger.info(`loaded ${url}`);
                    debugger;
                    return originalOnload(...args);
                }
            }
            return original(url, onload, onerror, noRunDep);
        }
    }

    // _hookBrowserObj() {
    //     const original = window.Browser.mainLoop.runIter;
    //     window.Browser.mainLoop.runIter = function(...args) {
    //         wyff.logger.info(`starting an iteration: ${args[0].name}`);
    //         return original(...args);
    //     }
    // }

}

/***/ }),

/***/ "./src/content-script/hooks/packets/received/chat.js":
/*!***********************************************************!*\
  !*** ./src/content-script/hooks/packets/received/chat.js ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   handleChatIndicatorPacket: () => (/* binding */ handleChatIndicatorPacket),
/* harmony export */   handleChatPacket: () => (/* binding */ handleChatPacket)
/* harmony export */ });
function handleChatPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacket = view.getUint32(0, true);
    const chatMessageLength = view.getUint32(4, true);
    const message = new TextDecoder("ascii").decode(msg.slice(8, 8 + chatMessageLength));
    const afterMessageUnknownBytes = 5;
    const whoDidIt = view.getBigUint64(8 + chatMessageLength + afterMessageUnknownBytes, true);
    // rest is unknown
    wyff.logger.info(`[received chat] message: "${message}", who did it: ${whoDidIt}`);
}

function handleChatIndicatorPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacket = view.getUint32(0, true);
    const chatIndicator = view.getUint8(4, true);
    const whoDidIt = view.getBigUint64(5, true);
    // rest is unknown
    wyff.logger.info(`[received chat indicator] chat indicator: "${chatIndicator ? 'chatting' : 'NOT chatting'}", who did it: ${whoDidIt}`);
}

/***/ }),

/***/ "./src/content-script/hooks/packets/received/movement.js":
/*!***************************************************************!*\
  !*** ./src/content-script/hooks/packets/received/movement.js ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   handleMovementPacket: () => (/* binding */ handleMovementPacket),
/* harmony export */   handlePersonLeavingOrEnterViewPacket: () => (/* binding */ handlePersonLeavingOrEnterViewPacket)
/* harmony export */ });
function handleMovementPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacketLength = 4;
    const unknownBytes = 13;
    const movementOperationOffset = cmdPacketLength + unknownBytes;
    const startOfMovementOperationArguments = cmdPacketLength + 18;
    let endOfMovementOperationArguments;

    const movementOperation = view.getUint8(movementOperationOffset, true);

    if (movementOperation === 1) {
        // we are moving in a direction using movement keys
        const angleOffset = startOfMovementOperationArguments;
        const angle = view.getFloat32(angleOffset, true);
        endOfMovementOperationArguments = angleOffset + 8;

        wyff.logger.info(`[received movement] moving using movement keys: angle: ${angle}`);
    } else if (movementOperation === 7) {
        // we are moving to a specific location using the mouse
        const x = view.getFloat32(startOfMovementOperationArguments, true);
        const y = view.getFloat32(startOfMovementOperationArguments + 8, true);
        const z = view.getFloat32(startOfMovementOperationArguments + 16, true);
        endOfMovementOperationArguments = startOfMovementOperationArguments + 24;

        wyff.logger.info(`[received movement] moving using the mouse: x: ${x}, y: ${y}, z: ${z}`);
    }

    const startOfUnknownHeader = cmdPacketLength;

    const whoDidIt = view.getBigUint64(endOfMovementOperationArguments, true);

    wyff.logger.info(
        `[received movement] %c${msg.slice(startOfUnknownHeader, startOfMovementOperationArguments - 4)},` +
        `%c${msg.slice(startOfMovementOperationArguments - 4, startOfMovementOperationArguments)},` +
        `%c${msg.slice(startOfMovementOperationArguments, endOfMovementOperationArguments)},` +
        `%c${msg.slice(endOfMovementOperationArguments)}` +
        `%c - who did it: ${whoDidIt}`,

        'background: orange; color: black;',
        'background: red; color: black;',
        'background: cyan; color: black;',
        'background: yellow; color: black;',
        '',
    );
}

function handlePersonLeavingOrEnterViewPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacketLength = 4;
    
}


/***/ }),

/***/ "./src/content-script/hooks/packets/received/player.js":
/*!*************************************************************!*\
  !*** ./src/content-script/hooks/packets/received/player.js ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   handleEquipmentChangePacket: () => (/* binding */ handleEquipmentChangePacket),
/* harmony export */   handleEquipmentVisibilityChangePacket: () => (/* binding */ handleEquipmentVisibilityChangePacket),
/* harmony export */   handleFashionChangePacket: () => (/* binding */ handleFashionChangePacket),
/* harmony export */   handleKickFromServerPacket: () => (/* binding */ handleKickFromServerPacket)
/* harmony export */ });
function handleFashionChangePacket(msg) {
    wyff.logger.info(`[received fashion change] %c${msg.join("\t")}`, 'background: orange; color: black;', {
        buffer: msg
    });
}

function handleEquipmentChangePacket(msg) {
    wyff.logger.info(`[received equipment change] %c${msg.join("\t")}`, 'background: chocolate; color: black;', {
        buffer: msg
    });
}

function handleEquipmentVisibilityChangePacket(msg) {
    wyff.logger.info(`[received equipment visibility change] %c${msg.join("\t")}`, 'background: coral; color: black;', {
        buffer: msg
    });
}

function handleKickFromServerPacket(msg) {
    wyff.logger.info(`[received kick from server???] %c${msg.join("\t")}`, 'background: lightred; color: black;', {
        buffer: msg
    });
}

/***/ }),

/***/ "./src/content-script/hooks/remove-debugger-protection.js":
/*!****************************************************************!*\
  !*** ./src/content-script/hooks/remove-debugger-protection.js ***!
  \****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ RemoveDebuggerProtection)
/* harmony export */ });
class RemoveDebuggerProtection {

    do() {
        wyff.logger.debug(`hooking function to remove debugger protection`);

        window._Function = Function;
        window.Function = function() {
            window.c = (a) => (a ? () => () => {} : null);
            wyff.logger.info(`debugger protection removed`);
            const fn = window._Function.apply(this, arguments);
            window.Function = window._Function;
            return fn;
        };
    }

}

/***/ }),

/***/ "./src/content-script/hooks/wasm-triggers.js":
/*!***************************************************!*\
  !*** ./src/content-script/hooks/wasm-triggers.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ HookWasmTriggers)
/* harmony export */ });
class HookWasmTriggers {
    do(instrumenterCallback) {
        if (typeof instrumenterCallback !== "function") {
            throw new Error("Expected instrumenterCallback to be a function");
        }

        this.instrumenterCallback = instrumenterCallback;

        wyff.logger.info(`hooking WASM functions`);
        // We need to hook into these two functions to capture when the wasm binary is about to be loaded
        // in and parsed by the browser. We can modify the binary before it reaches the browser engine.
        this.hookInstantiate();
        this.hookInstantiateStreaming();
    }

    hookInstantiate() {
        const oldFunction = WebAssembly.instantiate;
        const hook = (bufferSource, importObject = {}) => {
            wyff.logger.debug("WebAssembly.instantiate() intercepted");
            const instrumentResults = this.instrumenterCallback(bufferSource, importObject);
            return oldFunction(instrumentResults.binary, instrumentResults.imports);
        };

        window.WebAssembly.instantiate = hook;
    }

    hookInstantiateStreaming() {
        const hook = async (sourceObj, importObject = {}) => {
            wyff.logger.debug("WebAssembly.instantiateStreaming() intercepted");
            const buffer = await this._getSourceBuffer(sourceObj);
            return WebAssembly.instantiate(buffer, importObject);
        }

        window.WebAssembly.instantiateStreaming = hook;
    }

    async _getSourceBuffer() {
        if (sourceObj instanceof Promise) {
            const res = await sourceObj;
            return res.arrayBuffer()
        } else if (sourceObj instanceof Response) {
            return await sourceObj.arrayBuffer();
        } else {
            throw new Error("Got unexpected object type as first argument to WebAssembly.instantiateStreaming");
        }
    }
}

/***/ }),

/***/ "./src/content-script/hooks/websocket.js":
/*!***********************************************!*\
  !*** ./src/content-script/hooks/websocket.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ WebsocketHooks)
/* harmony export */ });
/* harmony import */ var _packets_received_chat__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./packets/received/chat */ "./src/content-script/hooks/packets/received/chat.js");
/* harmony import */ var _packets_received_movement__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./packets/received/movement */ "./src/content-script/hooks/packets/received/movement.js");
/* harmony import */ var _packets_received_player__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./packets/received/player */ "./src/content-script/hooks/packets/received/player.js");




class WebsocketHooks {
    websocketsCreated = [];
    lastMessage = null;
    possibleIndexes = [];

    init() {
        var self = this;
        var ws = window.WebSocket;

        const fakeConstructor = function(a, b) {
            var that = b ? new ws(a, b) : new ws(a);
            self.onWebsocketCreated(that);
            return that;
        }

        window.WebSocket = fakeConstructor;
    }

    onWebsocketCreated(ws) {
        this.websocketsCreated.push(ws);

        ws.addEventListener('close', (...args) => {
            this.websocketsCreated = this.websocketsCreated.filter((x) => x !== ws);
            wyff.logger.debug(`[ws] CLOSED`, args);
            // debugger;
        });
        
        ws.addEventListener('message', (msg) => {
            const message = new Uint8Array(msg.data);
            // first byte = magic byte (always 184)
            // byte 2-5 = length of the message (32 bit)
            // byte 6-9 = CRC-32 checksum

            const afterSkippedBytes = message.slice(9);

            const decryptedMessage = this.decryptionRoutine(afterSkippedBytes);
            const messageAscii = new TextDecoder("ascii").decode(decryptedMessage);

            // const separatorSequence = [0,0,0,1,0,0,0,1];
            // const individualCommands = [];
            // let currentCommandStartIndex = 0;
            
            // for (let i = 0; i < decryptedMessage.length; i++) {
            //     if (decryptedMessage[i] === separatorSequence[0]) {
            //         let found = true;
            //         for (let j = 1; j < separatorSequence.length; j++) {
            //             if (decryptedMessage[i+j] !== separatorSequence[j]) {
            //                 found = false;
            //                 break;
            //             }
            //         }

            //         if (found) {
            //             individualCommands.push(decryptedMessage.slice(currentCommandStartIndex, i));
            //             currentCommandStartIndex = i + separatorSequence.length;
            //         }
            //     }
            // }

            // if (individualCommands.length === 0) {
            //     individualCommands.push(decryptedMessage);
            // }

            wyff.logger.debug(`[ws] RECEIVED\n%c${decryptedMessage.join("\t")}%c\n%c${messageAscii}`, 'background: #c4e2ff; color: black;', '', 'background: #c4d0ff; color: black;', {
                decryptedMessage: decryptedMessage,
                encryptedMessage: message,
                // individualCommands: individualCommands,
            });

            // const separatorSequenceTabbed = separatorSequence.join("\t");
            // let decryptedMessagesExtraColors = [];
            // let decryptedAllCommandsInt8 = [];
            // let decryptedAllCommandsAscii = [];
            // let individualCommandHeaders = [];

            // for (let i = 0; i < individualCommands.length; i++) {
            //     const decryptedCommandInt8 = individualCommands[i];
            //     const decryptedCommandAscii = new TextDecoder("ascii").decode(decryptedCommandInt8);

            //     const view = new DataView(decryptedCommandInt8.buffer);
            //     const cmdPacket = view.getUint32(0, true);
            //     individualCommandHeaders.push(cmdPacket);

            //     decryptedAllCommandsInt8.push(decryptedCommandInt8.join("\t"));
            //     decryptedAllCommandsAscii.push(decryptedCommandAscii);

            //     if (i > 0) {
            //         decryptedMessagesExtraColors.push('background: #ffcccb; color: black;');
            //         decryptedMessagesExtraColors.push('background: #c4e2ff; color: black;');
            //     }
            // }

            // wyff.logger.debug(`[ws] RECEIVED\n%c${decryptedAllCommandsInt8.join("%c" + separatorSequenceTabbed + "%c")}%c\n%c${decryptedAllCommandsAscii.join("\n")}`, 'background: #c4e2ff; color: black;', ...decryptedMessagesExtraColors, '', 'background: #c4d0ff; color: black;', {
            //     buffer: decryptedMessage,
            //     encryptedMessage: message,
            //     // individualCommands: individualCommands,
            //     // individualCommandHeaders: individualCommandHeaders.map(x => `0x${x.toString(16)}`),
            // });

            this._handleReceivedPacket(decryptedMessage);
            // for (let i = 0; i < individualCommands.length; i++) {
            //     this._handleReceivedPacket(individualCommands[i]);
            // }

            this.lastMessage = message;
        });

        const originalSend = ws.send;
        ws.send = (data) => {
            const message = new Uint8Array(data);
            // first byte = magic byte (always 31)
            // byte 2-5 = length of the message (32 bit)
            // byte 6-9 = CRC-32 checksum
            const afterSkippedBytes = message.slice(9);

            const decryptedMessage = this.encryptionRoutine(afterSkippedBytes);
            const messageAscii = new TextDecoder("ascii").decode(decryptedMessage);

            wyff.logger.debug(`[ws] SENDING\n%c${decryptedMessage.join("\t")}%c\n%c${messageAscii}`, 'background: #c4ffcd; color: black;', '', 'background: #a7facd; color: black;', {
                decryptedMessage: decryptedMessage,
                originalMessage: message,
            });

            originalSend.call(ws, message);
        };

        // Patch every single function on the WebSocket object so we can intercept all function calls
        for (let key in ws) {
            if (typeof ws[key] === 'function') {
                ws[key] = new Proxy(ws[key], {
                    apply: (target, thisArg, argumentsList) => {
                        if (key === 'close') {
                            // debugger;
                        }
                        wyff.logger.debug(`[ws] CALLING ${key}`, argumentsList);
                        return target.apply(thisArg, argumentsList);
                    }
                });
            }
        }
    }

    encryptionRoutine(message) {
        const result = new Uint8Array(message.length);
        for (var i = 0; i < message.length; i++) {
            let xorKeyIndex = (i+1) & (wyff.encryptionXorKey.length-1);
            result[i] = message[i] ^ wyff.encryptionXorKey[xorKeyIndex];
        }
        return result;
    }

    decryptionRoutine(message) {
        const result = new Uint8Array(message.length);
        for (var i = 0; i < message.length; i++) {
            let xorKeyIndex = (i+1) & (wyff.decryptionXorKey.length-1);
            result[i] = message[i] ^ wyff.decryptionXorKey[xorKeyIndex];
        }
        return result;
    }

    async _handleReceivedPacket(msg) {
        const view = new DataView(msg.buffer);
        const cmdPacket = view.getUint32(0, true);

        const packetDictionary = {
            /* none of this is right anymore. */

            // // 0x646a8400: handleClientInitialInfoPacket,
            // 0x641ab004: handleMovementPacket,
            // 0x646ab44e: handleChatIndicatorPacket,
            // 0x646ab400: handleChatPacket,
            // // 0x646a843d: handlePersonLoggingInIntoView,
            // 0x646a8402: handlePersonLeavingOrEnterViewPacket,
            // 0x646a842a: handleFashionChangePacket,
            // 0x646a8427: handleEquipmentChangePacket,
            // 0x646a8418: handleEquipmentVisibilityChangePacket,
        }

        if (packetDictionary[cmdPacket]) {
            packetDictionary[cmdPacket](msg);
        }
    }

    getActiveWebsocket() {
        return this.websocketsCreated.find((ws) => ws.readyState === 1);
    }
}

/***/ }),

/***/ "./src/content-script/instrumenter/defs/wasm-import-function.js":
/*!**********************************************************************!*\
  !*** ./src/content-script/instrumenter/defs/wasm-import-function.js ***!
  \**********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ WasmImportFunction)
/* harmony export */ });
class WasmImportFunction {
    constructor (name, params, func) {
        this.name = name;
        this.params = params;
        this.func = func;
    }
}

/***/ }),

/***/ "./src/content-script/instrumenter/function-finder.js":
/*!************************************************************!*\
  !*** ./src/content-script/instrumenter/function-finder.js ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ FunctionFinder)
/* harmony export */ });
class FunctionFinder {
    constructor(parser) {
        this.wailParser = parser;
    }

    _getBytesPatternWithWildcards(bytesToFind) {
        // Convert bytesToFind to a Uint8Array and mark where the wildcards are
        const wildcardIndexes = [];
        const buffer = new BufferReader();
        bytesToFind.forEach(v => {
            if (v === '?') {
                wildcardIndexes.push(buffer.length);
                buffer.copyBuffer([0x00]);
            } else {
                buffer.copyBuffer(Array.isArray(v) ? v : [v]);
            }
        });
        
        return {
            bytes: new Uint8Array(buffer.write()),
            wildcardIndexes,
        };
    }

    findFunction(bytesToFind) {
        const { bytes: bytesToFindView, wildcardIndexes } = this._getBytesPatternWithWildcards(bytesToFind);

        // get copy of wail parser without any modifications
        const copyParser = new WailParser(this.wailParser.inBuffer);
        const matchingFunctionIndexes = [];

        const checkIfFunctionMatches = function ({ index: functionIndex, bytes: codeBytes }) {
            let startIndex;
            for (let i = 0; i < codeBytes.length; i++) {
                if (codeBytes[i] === bytesToFindView[0]) {
                    let match = true;
                    startIndex = i;
                    for (let j = 1; j < bytesToFindView.length; j++) {
                        if (codeBytes[i + j] !== bytesToFindView[j] && !wildcardIndexes.includes(j)) {
                            match = false;
                            break;
                        }
                    }

                    if (match) {
                        matchingFunctionIndexes.push(functionIndex);
                        wyff.logger.debug(`Found function using bytes`, { functionBytes: codeBytes, bytesToFindView, functionIndex, matchedBytes: codeBytes.subarray(startIndex, startIndex + bytesToFindView.length) });
                    }
                }
            }

            return codeBytes;
        }

        // Parse and handle each individual function to see if the code bytes match
        copyParser.addCodeElementParser(null, checkIfFunctionMatches);
        copyParser.parse();

        if (matchingFunctionIndexes.length === 0) {
            wyff.logger.error(`Could not find function using bytes`, { bytesToFindView });
            throw new Error("Could not find function using bytes");
        }

        if (matchingFunctionIndexes.length > 1) {
            wyff.logger.error(`Found multiple functions using bytes`, { bytesToFindView, matchingFunctionIndexes });
            throw new Error("Found multiple functions using bytes");
        }

        return this.wailParser._getAdjustedFunctionIndex(matchingFunctionIndexes[0]);
    }
}

/***/ }),

/***/ "./src/content-script/instrumenter/index.js":
/*!**************************************************!*\
  !*** ./src/content-script/instrumenter/index.js ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ BinaryInstrumenter)
/* harmony export */ });
/* harmony import */ var _utils_merge__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/merge */ "./src/utils/merge.js");
/* harmony import */ var _defs_wasm_import_function__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./defs/wasm-import-function */ "./src/content-script/instrumenter/defs/wasm-import-function.js");



class BinaryInstrumenter {
    wailParser = null;

    constructor() {
        this.instruments = [];
    }

    add(name, instrument) {
        if (instrument && typeof instrument !== 'object') {
            throw new Error("instrument must be an object");
        }

        this.instruments[name] = instrument;
    }

    run(bufferSource, imports = {}) {
        this.wailParser = new WailParser(bufferSource);

        /**
         * We need to know all of our imports before we start calling
         * our instruments because function indexes shift as we
         * import new functions.
         */
        const { finalImports, newImportRefs } = this._initAndCollectImports(bufferSource, imports);

        // now call each instrument's instrument function
        for (const name in this.instruments) {
            wyff.logger.info(`Running instrument: ${name}`);

            const instrument = this.instruments[name];
            if (typeof instrument.instrument === 'function') {
                instrument.instrument(newImportRefs);
            }
        }

        this.wailParser.parse(); // kicks off everything

        return {
            binary: this.wailParser.write(),
            imports: finalImports,
        };
    }

    _initAndCollectImports(bufferSource, originalImports) {
        let finalImports = originalImports;
        let newImportRefs = {};

        for (const name in this.instruments) {
            const instrument = this.instruments[name];

            instrument.init(this.wailParser, bufferSource, originalImports);

            // what imports are you replacing
            finalImports = (0,_utils_merge__WEBPACK_IMPORTED_MODULE_0__.mergeDeep)(finalImports, instrument.replacedImports);

            // what imports are you creating
            const newImports = instrument.addedImports;
            for (const [name, importDef] of Object.entries(newImports)) {
                newImportRefs[name] = this.addFunctionImport(name, importDef.params, importDef.returnType);

                finalImports[instrument.PARENT_NEW_IMPORTS_KEY] = finalImports[instrument.PARENT_NEW_IMPORTS_KEY] || {};
                finalImports[instrument.PARENT_NEW_IMPORTS_KEY][name] = importDef.callable;
            }
        }

        return { finalImports, newImportRefs };
    }

    addFunctionImport(name, params, returnType) {
        return this.wailParser.addImportEntry({
            moduleStr: "env",
            fieldStr: name,
            kind: "func",
            type: this.wailParser.addTypeEntry({
                form: "func",
                params: params,
                returnType: returnType
            })
        });
    }

    _mergeImports(startingImports = {}, newImportDefs = {}) {
        const newImports = {};
        for (const [name, importDef] of Object.entries(newImportDefs)) {
            newImports[name] = importDef.func;
        }

        return (0,_utils_merge__WEBPACK_IMPORTED_MODULE_0__.mergeDeep)(startingImports, {
            env: newImports
        });
    }
}

/***/ }),

/***/ "./src/content-script/instrumenter/instruments/base.js":
/*!*************************************************************!*\
  !*** ./src/content-script/instrumenter/instruments/base.js ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Instrument)
/* harmony export */ });
/* harmony import */ var _function_finder_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../function-finder.js */ "./src/content-script/instrumenter/function-finder.js");


function findKeyFromFunctionName(imports, functionName) {
    const keys = Object.keys(imports);
    const index = keys.findIndex(x => imports[x].name === functionName);
    if (index === -1) {
        return null;
    }

    return keys[index];
}

class Instrument {
    PARENT_IMPORTS_KEY = "a"; // all emscripten imports are under imports['a']
    PARENT_NEW_IMPORTS_KEY = "env" // all new imports will live under imports['env']

    wailParser = null;
    binarySource = null;
    imports = {};
    replacedImports = {};
    addedImports = {}

    init(wailParser, binarySource, imports = {}) {
        this.wailParser = wailParser;
        this.binarySource = binarySource;
        this.imports = imports;
    }

    hookImport(originalFunctionName, hookFunction) {
        const key = findKeyFromFunctionName(this.imports[this.PARENT_IMPORTS_KEY], originalFunctionName);
        if (!key) {
            throw new Error(`could not find wasm import using function name ${originalFunctionName}`);
        }
        const originalFunction = this.imports[this.PARENT_IMPORTS_KEY][key];
        const newFunction = function(...args) {
            return hookFunction(originalFunction, ...args);
        }

        this.replacedImports[this.PARENT_IMPORTS_KEY] = this.replacedImports[this.PARENT_IMPORTS_KEY] || {}
        this.replacedImports[this.PARENT_IMPORTS_KEY][key] = newFunction;
    }

    addImport(name, params, returnType, callable) {
        this.addedImports[name] = {
            params,
            returnType,
            callable
        };
    }

    findFunctionUsingBytes(bytesPattern) {
        const functionFinder = new _function_finder_js__WEBPACK_IMPORTED_MODULE_0__["default"](this.wailParser);
        return functionFinder.findFunction(bytesPattern);
    }

}

/***/ }),

/***/ "./src/content-script/instrumenter/instruments/decryption.js":
/*!*******************************************************************!*\
  !*** ./src/content-script/instrumenter/instruments/decryption.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DecryptionInstrument)
/* harmony export */ });
/* harmony import */ var _function_finder__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../function-finder */ "./src/content-script/instrumenter/function-finder.js");
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./base.js */ "./src/content-script/instrumenter/instruments/base.js");



class DecryptionInstrument extends _base_js__WEBPACK_IMPORTED_MODULE_1__["default"] {

    init(wailParser, bufferSource, imports) {
        super.init(wailParser, bufferSource, imports);

        // this.addImport("decryptionHook", ["i32", "i32"], null, this.decryptionHook.bind(this));
    }

    instrument(importRefs) {
        // find the decryption function
        const funcIndex = this.findFunctionUsingBytes([
            OP_GET_LOCAL, VarUint32(0x02),
            OP_I32_LOAD, VarUint32(0x02), VarUint32(36),
            OP_I32_LOAD, 0x00, VarUint32(5),
        ]);

        wyff.logger.info(`instrumenting the decryption function @ func${funcIndex}`);

        this.wailParser.addCodeElementParser(funcIndex, function ({ bytes }) {
            const reader = new BufferReader(bytes);

            const codeBytesWithoutEnd = bytes.subarray(0, bytes.length - 1);

            // look through the code bytes until we find:
            //   local.get $var1
            //   i32.const 1
            //   i32.add
            //   local.tee $var1
            //   i32.const 31
            //   i32.and
            //
            // We are trying to find this sequence because the xor key is 2 bytes from the end of this sequence.
            const sequence = [
                OP_GET_LOCAL, 1,
                OP_I32_CONST, 1,
                OP_I32_ADD,
                OP_TEE_LOCAL, 1,
                OP_I32_CONST, 31,
                OP_I32_AND,
            ];

            let found = false;
            for (let i = 0; i < codeBytesWithoutEnd.length; i++) {
                found = true;
                for (let j = 0; j < sequence.length; j++) {
                    if (codeBytesWithoutEnd[i + j] !== sequence[j]) {
                        found = false;
                        break;
                    }
                }

                if (found) {
                    // from here, the xor key is 2 bytes from the end of the sequence.
                    const startingPosition = i + sequence.length + 1;

                    // pull 4 bytes from the starting position
                    const xorKeyReader = new BufferReader(codeBytesWithoutEnd.subarray(startingPosition, startingPosition+4));
                    // read the varuint32 from the 4 bytes and add 1. this puts us at the starting position of the xor key.
                    const xorKeyMemoryAddressStart = xorKeyReader.readVarUint32();
                    wyff.logger.info(`[decrypt function] found xor key @ address 0x${xorKeyMemoryAddressStart.toString(16)}`);
                    // record the address for later. the binary hasn't even run yet, so we can't pull the xor key yet.
                    wyff.decryptionXorKeyMemoryAddress = xorKeyMemoryAddressStart;

                    break;
                }
            }

            if (!found) {
                wyff.logger.error("could not find the memory address storing the xor key");
            }

            reader.copyBuffer(codeBytesWithoutEnd);

            // /**
            //  * At the very end of the decryption function,
            //  * var0 is a memory address that contains the address of the beginning of the message payload.
            //  * var1 is a memory address that contains the address of the end of the message payload.
            //  * 
            //  * Send those two addresses to our decryption hook.
            //  */
            // reader.copyBuffer([ OP_GET_LOCAL ]);
            // reader.copyBuffer(VarUint32(0x00));
            // reader.copyBuffer([ OP_GET_LOCAL ]);
            // reader.copyBuffer(VarUint32(0x01));
            // reader.copyBuffer([ OP_CALL ]);
            // reader.copyBuffer(importRefs.decryptionHook.varUint32());

            reader.copyBuffer([ OP_END ]);

            return reader.write();
        });
    }

    /** same reason this is commented out as encryption.js */
 
    // decryptionHook(beginAddress, endAddress) {
    //     // Using the beginAddress and endAddress, we can get the message payload from memory
    //     const length = endAddress - beginAddress;
    //     const message = new Uint8Array(new Uint8Array(wasmMemory.buffer, beginAddress, length));
    
    //     // const first4Bytes = message.slice(4, 8);
    //     // const first4BytesUint32 = new Uint32Array(first4Bytes.buffer)[0];
    //     // let cmdNumber = first4BytesUint32;
    //     // this.handleMessageByCommand(cmdNumber, message);
    
    //     // convert to ascii
    //     const messageAscii = new TextDecoder("ascii").decode(message);
    
    //     wyff.logger.debug(`[decrypt hook] [old] RECEIVED\n%c${message.join("\t")}%c\n%c${messageAscii}`, 'background: #c4e2ff; color: black;', '', 'background: #c4d0ff; color: black;', {
    //         buffer: message,
    //         originalMessage: wyff.websocketHooks.lastMessage,
    //     });
    // }

    // handleMessageByCommand(cmdNumber, message) {
    //     switch (cmdNumber) {
    //         // case 260372: return handleCombatPacket(message)
    //     }

    //     return null;
    // }
}

/***/ }),

/***/ "./src/content-script/instrumenter/instruments/encryption.js":
/*!*******************************************************************!*\
  !*** ./src/content-script/instrumenter/instruments/encryption.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ EncryptionInstrument)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./src/content-script/instrumenter/instruments/base.js");


class EncryptionInstrument extends _base_js__WEBPACK_IMPORTED_MODULE_0__["default"] {
    init(wailParser, bufferSource, imports) {
        super.init(wailParser, bufferSource, imports);

        // this.addImport("encryptionHook", ["i32"], null, this.encryptionHook.bind(this));
    }

    instrument(importRefs) {
        const funcIndex = this.findFunctionUsingBytes([
            /**
             * These bytes are the very beginning of the encryption function
             */
             OP_GET_LOCAL, VarUint32(0x00),
             OP_I32_LOAD, VarUint32(0x02), VarUint32(4),
             OP_TEE_LOCAL, VarUint32(0x02),
             OP_GET_LOCAL, VarUint32(0x00),
             OP_I32_LOAD, VarUint32(0x02), VarUint32(0x00),
             OP_TEE_LOCAL, VarUint32(0x03),
             OP_I32_SUB,
             OP_SET_LOCAL, VarUint32(0x06),
             OP_I32_CONST, 9,
             OP_SET_LOCAL, VarUint32(0x07),
        ]);

        wyff.logger.info(`instrumenting the encryption function @ func${funcIndex}`);

        this.wailParser.addCodeElementParser(funcIndex, function ({ bytes }) {
            const reader = new BufferReader(bytes);

            // look through the code bytes until we find:
            //   i32.load8_u
            //   local.tee $var2
            //   local.get $var5
            //   i32.const 1
            //   i32.add
            //   local.tee $var5
            //   i32.const 31
            //   i32.and

            const sequence = [
                OP_I32_LOAD8_U, 0, 0,
                OP_TEE_LOCAL, 2,
                OP_GET_LOCAL, 5,
                OP_I32_CONST, 1,
                OP_I32_ADD,
                OP_TEE_LOCAL, 5,
                OP_I32_CONST, 31,
                OP_I32_AND,
            ];

            let found = false;
            for (let i = 0; i < bytes.length; i++) {
                found = true;
                for (let j = 0; j < sequence.length; j++) {
                    if (bytes[i + j] !== sequence[j]) {
                        found = false;
                        break;
                    }
                }

                if (found) {
                    // from here, the xor key is 2 bytes from the end of the sequence.
                    const startingPosition = i + sequence.length + 1;

                    // pull 4 bytes from the starting position
                    const xorKeyReader = new BufferReader(bytes.subarray(startingPosition, startingPosition+4));
                    // read the varuint32 from the 4 bytes and add 1. this puts us at the starting position of the xor key.
                    const xorKeyMemoryAddressStart = xorKeyReader.readVarUint32();
                    wyff.logger.info(`[encrypt function] found xor key @ address 0x${xorKeyMemoryAddressStart.toString(16)}`);
                    // record the address for later. the binary hasn't even run yet, so we can't pull the xor key yet.
                    wyff.encryptionXorKeyMemoryAddress = xorKeyMemoryAddressStart;
                    break;
                }
            }

            if (!found) {
                wyff.logger.error(`[encrypt function] could not find xor key`);
            }
    
            // /**
            //  * At the beginning of the encryption function, var0 is a memory address
            //  * that contains the address of the beginning of the message payload.
            //  */
    
            // // push the first arg of the function onto the stack
            // reader.copyBuffer([ OP_GET_LOCAL ]);
            // reader.copyBuffer(VarUint32(0x00));
            // // call the hook function
            // reader.copyBuffer([ OP_CALL ]);
            // reader.copyBuffer(importRefs.encryptionHook.varUint32());
    
            // push the rest of the function
            reader.copyBuffer(bytes);
            return reader.write();
        });
    }

    /** this code below was when i didnt know how to get the xor key. so i just pulled the message from the encrypt function w/o decrypting anything */

    // encryptionHook(ptr) {
    //     /**
    //      * Now we have the address of the beginning of the message payload
    //      * var0+4 is an address that contains the address of the end of the message payload
    //      */
    //     const dataview = new DataView(window.wasmMemory.buffer);
    
    //     const beginningOfMsgPtr = dataview.getUint32(ptr, true);
    //     const endOfMsgPtr = dataview.getUint32(ptr + 4, true);
    
    //     // calculate length using addresses
    //     const messageLength = endOfMsgPtr - beginningOfMsgPtr;
    //     // get the message
    //     const message = new Uint8Array(new Uint8Array(window.wasmMemory.buffer, beginningOfMsgPtr, messageLength));
    
    //     // get first 4 bytes of the message
    //     const first4Bytes = message.slice(0, 4);
    //     // convert to uint32
    //     const first4BytesUint32 = new Uint32Array(first4Bytes.buffer)[0];
    //     let cmdNumber = first4BytesUint32;
    //     let isMessageEncrypted = first4Bytes[3] === 100;
    //     if (isMessageEncrypted) {
    //         // the command packet is encrypted
    //         const secretnumber = 1684713472;
    //         cmdNumber = first4BytesUint32 ^ secretnumber;
    
    //         this._handleMessageByCommand(cmdNumber, message);
    //     }
    
    //     // convert to ascii
    //     const messageAscii = new TextDecoder("ascii").decode(message);
    
    //     wyff.logger.debug(`SENDING (cmd: ${cmdNumber} (${isMessageEncrypted ? 'E' : 'NE'}))\n%c${message.join("\t")}%c\n%c${messageAscii}`, 'background: #c4ffcd; color: black;', '', 'background: #a7facd; color: black;', {
    //         buffer: message,
    //     });
    // }

    // _handleMessageByCommand(cmdNumber, message) {
    //     switch (cmdNumber) {
    //         case 1028: return handleMovementPacket(message);
    //     }

    //     return;
    // }


}

/***/ }),

/***/ "./src/content-script/instrumenter/instruments/hook-emval.js":
/*!*******************************************************************!*\
  !*** ./src/content-script/instrumenter/instruments/hook-emval.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ HookEmval)
/* harmony export */ });
/* harmony import */ var _utils_base64_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../utils/base64.js */ "./src/utils/base64.js");
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./base.js */ "./src/content-script/instrumenter/instruments/base.js");



class HookEmval extends _base_js__WEBPACK_IMPORTED_MODULE_1__["default"] {
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

/***/ }),

/***/ "./src/content-script/instrumenter/instruments/memory.js":
/*!***************************************************************!*\
  !*** ./src/content-script/instrumenter/instruments/memory.js ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Sequence: () => (/* binding */ Sequence),
/* harmony export */   "default": () => (/* binding */ MemoryInstrument)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./src/content-script/instrumenter/instruments/base.js");


class Sequence {
    sequence = [];
    recordedAddressAccess = [];

    constructor(sequence) {
        this.sequence = sequence;
        this.recordedAddressAccess = sequence.map(() => []);
    }
}

class MemoryInstrument extends _base_js__WEBPACK_IMPORTED_MODULE_0__["default"] {

    /**
     * The idea behind this is: it is possible for us to be in the middle
     * of every single read/write memory operation. (thx Cetus)
     * Because of that, we can watch specific addresses and break.
     * We can also watch for specific sequences of read/writes, which is super
     * powerful for finding specific operations.
     */
    watchAddresses = {
        // "address" => { "read": bool, "write": bool }
    };

    // watchForWrittenMemorySequences = {
        // "[purpose]": new Sequence([], ),
    // };

    init(wailParser, bufferSource, imports) {
        super.init(wailParser, bufferSource, imports);

        this._addImports();

        this.writeEntrypointI32 = wailParser.addFunctionEntry({
            type: wailParser.addTypeEntry({
                form: "func",
                params: [ "i32", "i32", "i32" ],
            })
        });

        this.lastWriteInfo = {
            "address": wailParser.addGlobalEntry({
                globalType: {
                    contentType: "i32",
                    mutability: true,
                },
                initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
            }),

            "value_i32": wailParser.addGlobalEntry({
                globalType: {
                    contentType: "i32",
                    mutability: true,
                },
                initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
            }),
        };
    }

    _addImports() {
        this.addImport("readMemoryHook", ["i32", "i32", "i32"], "i32", this.readMemoryHook.bind(this));
        this.addImport("writeMemoryHook", ["i32", "i32", "i32"], null, this.writeMemoryHook.bind(this));
    }

    instrument(importRefs) {
        this.wailParser.addCodeEntry(this.writeEntrypointI32, {
            locals: [],
            code: [
                OP_GET_LOCAL, VarUint32(0),
                OP_SET_GLOBAL, this.lastWriteInfo.address.varUint32(),
                OP_GET_LOCAL, VarUint32(1),
                OP_SET_GLOBAL, this.lastWriteInfo.value_i32.varUint32(),
                
                OP_GET_LOCAL, VarUint32(0),
                OP_GET_LOCAL, VarUint32(1),
                OP_GET_LOCAL, VarUint32(2),
                OP_CALL, importRefs.writeMemoryHook.varUint32(),
                OP_END
            ]
        });

        this.wailParser.addInstructionParser(OP_I32_LOAD,     this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD,     this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_F32_LOAD,     this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_F64_LOAD,     this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I32_LOAD8_S,  this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I32_LOAD8_U,  this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I32_LOAD16_S, this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I32_LOAD16_U, this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD8_S,  this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD8_U,  this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD16_S, this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD16_U, this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD32_S, this.readMemoryInstrument(importRefs.readMemoryHook));
        this.wailParser.addInstructionParser(OP_I64_LOAD32_U, this.readMemoryInstrument(importRefs.readMemoryHook));

        // this.wailParser.addInstructionParser(OP_I32_STORE,   this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I64_STORE,   this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_F32_STORE,   this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_F64_STORE,   this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I32_STORE8,  this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I32_STORE16, this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I64_STORE8,  this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I64_STORE16, this.writeMemoryInstrument(importRefs.writeMemoryHook));
        // this.wailParser.addInstructionParser(OP_I64_STORE32, this.writeMemoryInstrument(importRefs.writeMemoryHook));

        // this.wailParser.addInstructionParser(OP_SIMD, this.simdInstrCallback);
        // this.wailParser.addInstructionParser(OP_ATOMIC, this.atomicInstrCallback);
    }

    readMemoryInstrument(importFunc) {
        return function (instrBytes) {
            const reader = new BufferReader(instrBytes);

            const opcode = reader.readUint8();
            const flags = reader.readVarUint32();
            const offset = reader.readVarUint32();

            let pushSizeImmediate;
            let arg;

            switch (opcode) {
                case OP_I32_LOAD8_S:
                case OP_I32_LOAD8_U:
                case OP_I64_LOAD8_S:
                case OP_I64_LOAD8_U:
                    pushSizeImmediate = VarUint32(1);
                    break;
                case OP_I32_LOAD16_S:
                case OP_I32_LOAD16_U:
                case OP_I64_LOAD16_S:
                case OP_I64_LOAD16_U:
                    pushSizeImmediate = VarUint32(2);
                    break;
                case OP_I32_LOAD:
                case OP_F32_LOAD:
                case OP_I64_LOAD32_S:
                case OP_I64_LOAD32_U:
                    pushSizeImmediate = VarUint32(4);
                    break;
                case OP_I64_LOAD:
                case OP_F64_LOAD:
                    pushSizeImmediate = VarUint32(8);
                    break;
                case OP_SIMD:
                    arg = instrBytes[1];
                    switch(arg) {
                        case SIMD_V128_LOAD8_SPLAT:
                            pushSizeImmediate = VarUint32(1);
                            break;
                        case SIMD_V128_LOAD16_SPLAT:
                            pushSizeImmediate = VarUint32(2);
                            break;
                        case SIMD_V128_LOAD32_ZERO:
                        case SIMD_V128_LOAD32_SPLAT:
                            pushSizeImmediate = VarUint32(4);
                            break;
                        case SIMD_V128_LOAD8X8_S:
                        case SIMD_V128_LOAD8X8_U:
                        case SIMD_V128_LOAD16X4_S:
                        case SIMD_V128_LOAD16X4_U:
                        case SIMD_V128_LOAD32X2_S:
                        case SIMD_V128_LOAD32X2_U:
                        case SIMD_V128_LOAD64_SPLAT:
                        case SIMD_V128_LOAD64_ZERO:
                            pushSizeImmediate = VarUint32(8);
                            break;
                        case SIMD_V128_LOAD:
                            pushSizeImmediate = VarUint32(16);
                            break;
                    }
                    break;
                case OP_ATOMIC:
                    arg = instrBytes[1];
                    switch(arg) {
                        case ARG_I32_ATOMIC_LOAD:
                        case ARG_I64_ATOMIC_LOAD_32U:
                            pushSizeImmediate = VarUint32(4);
                            break;
                        case ARG_I64_ATOMIC_LOAD:
                            pushSizeImmediate = VarUint32(8);
                            break;
                        case ARG_I32_ATOMIC_LOAD_8U:
                        case ARG_I64_ATOMIC_LOAD_8U:
                            pushSizeImmediate = VarUint32(1);
                            break;
                        case ARG_I32_ATOMIC_LOAD_16U:
                        case ARG_I64_ATOMIC_LOAD_16U:
                            pushSizeImmediate = VarUint32(2);
                            break;
                        default:
                            throw new Error("Bad atomic argument in readMemoryInstrument()");
                    }
                    break;
                default:
                    throw new Error("Bad opcode in readMemoryInstrument()");
            }

            reader.copyBuffer([ OP_I32_CONST ]);
            reader.copyBuffer(pushSizeImmediate);
            reader.copyBuffer([ OP_I32_CONST ]);
            reader.copyBuffer(VarUint32(offset));
            reader.copyBuffer([ OP_CALL ]);
            reader.copyBuffer(importFunc.varUint32());
            reader.copyBuffer(instrBytes);

            return reader.write();
        }
    }

    writeMemoryInstrument(importFunc) {
        return (instrBytes) => {
            const reader = new BufferReader();

            reader.copyBuffer([ OP_I32_CONST ]);
            reader.copyBuffer(VarUint32(instrBytes[2] || 0));
            reader.copyBuffer([ OP_CALL ]);
            reader.copyBuffer(this.writeEntrypointI32.varUint32());
            
            reader.copyBuffer([ OP_GET_GLOBAL ])
            reader.copyBuffer(this.lastWriteInfo.address.varUint32());
            reader.copyBuffer([ OP_GET_GLOBAL ])
            reader.copyBuffer(this.lastWriteInfo.value_i32.varUint32());
            reader.copyBuffer(instrBytes);

            return reader.write();
        };
    }

    addAddressWatch(address, read = true, write = true, handler = null) {
        this.watchAddresses[address] = { read, write, handler };
    }

    readMemoryHook(baseAddress, loadSize, loadOffset) {
        const startAddress = baseAddress + loadOffset;
        const endAddress = startAddress + loadSize;
        for (let i = startAddress; i < endAddress; i++) {
            const watch = this.watchAddresses[i];
            if (watch && watch.read) {
                const handler = watch.handler;
                if (handler) {
                    handler(i);
                } else {
                    wyff.logger.info(`Read ${loadSize} bytes from 0x${startAddress.toString(16)}`);
                }
            }
        }

        return baseAddress;
    }

    writeMemoryHook(baseAddress, i32_value, offset) {
        const address = baseAddress + offset;
        const watch = this.watchAddresses[address];
        if (watch && watch.write) {
            const handler = watch.handler;
            if (handler) {
                handler(address, i32_value);
            } else {
                wyff.logger.info(`Write to ${address.toString(16)} = value ${i32_value}`);
            }
        }

        // const index = this.sequence.indexOf(i32_value);
        // if (index !== -1) {
        //     if (index === 0) {
        //         this.recorded[0].push(address);
        //     } else {
        //         // the previous ones should have already been recorded then.
        //         let eliminated = false;
        //         for (let i = index - 1; i >= 0; i--) {
        //             const shouldBeAddress = address - (index-i);
        //             if (!this.recorded[i] || this.recorded[i].indexOf(shouldBeAddress) === -1) {
        //                 // noooo!
        //                 eliminated = true;
        //                 break;
        //             }
        //         }

        //         if (!eliminated) {
        //             this.recorded[index].push(address);
        //             if (index === this.sequence.length - 1) {
        //                 wyff.logger.info("woo", address - this.sequence.length);
        //             }
        //         }
        //     }
        // }
    }

    clearHistory() {
        this.recorded = this.sequence.map(() => []);
    }
}

/***/ }),

/***/ "./src/content-script/memory/index.js":
/*!********************************************!*\
  !*** ./src/content-script/memory/index.js ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MemoryWrapper: () => (/* binding */ MemoryWrapper)
/* harmony export */ });
/* harmony import */ var _utils_hex_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/hex.js */ "./src/utils/hex.js");


class MemoryWrapper {

    constructor(memory) {
        this.memory = memory;
    }

    getMemoryType(memType) {
        switch (memType) {
            case "i8":
            case "ascii":
            case "bytes":
                return Uint8Array;
            case "i16":
            case "utf-8":
                return Uint16Array;
            case "i32":
                return Uint32Array;
            case "i64":
                return BigInt64Array;
            case "f32":
                return Float32Array;
            case "f64":
                return Float64Array;
            default:
                throw new Error("Invalid memory type " + memType + " in getMemoryType()");
        }
    }

    // Accessing aligned memory is faster because we can just treat the whole
    // memory object as the relevant typed array (Like Uint32Array)
    // This is not as thorough, however, because we will miss matching values
    // that are not stored at naturally-aligned addresses
    alignedMemory(memTypeStr) {
        const memType = this.getMemoryType(memTypeStr);

        // We return a new object each time because the WebAssembly.Memory object
        // will detach if it is resized
        return new memType(this.memory.buffer);
    }

    // When we need to access unaligned memory addresses, we treat memory as a
    // Uint8Array so that we can read at any "real" address
    unalignedMemory() {
        return new Uint8Array(this.memory.buffer);
    }

    getMemorySize() {
        return this.unalignedMemory().length;
    }

    search(memType, searchValue, lowerBound, upperBound) {
        const result = {};

        let realLowerBound = parseInt(lowerBound);
        let realUpperBound = parseInt(upperBound);

        if (realLowerBound < 0) {
            realLowerBound = 0;
        }

        const memSize = this.getMemorySize();

        if (realUpperBound >= memSize) {
            realUpperBound = memSize - 1;
        }

        let realParam;

        switch (memType) {
            case "ascii":
                realParam = new Uint8Array(searchValue.length);

                for (let i = 0; i < searchValue.length; i++) {
                    realParam[i] = searchValue.charCodeAt(i);
                }

                break;
            case "utf-8":
                const tempBuf = new Uint16Array(searchValue.length);

                for (let i = 0; i < searchValue.length; i++) {
                    realParam[i] = searchValue.charCodeAt(i);
                }

                realParam = new Uint8Array(tempBuf.buffer);

                break;
            case "bytes":
                if (Array.isArray(searchValue)) {
                    realParam = new Uint8Array(searchValue);
                } else {
                    const split1 = [...searchValue.trim().matchAll(/\\x[0-9a-f]{2}(?![0-9a-z])/gi)];
                    const split2 = searchValue.trim().split(/\\x/);

                    if ((split1.length != (split2.length - 1)) || split1.length == 0) {
                        // Something is wrong in the byte sequence
                        console.error("Wrong byte sequence format");
                        return;
                    }

                    split2.shift();

                    realParam = new Uint8Array(split2.length);
                    for (let i = 0; i < searchValue.length; i++) {
                        realParam[i] = parseInt(split2[i], 16);
                    }
                }

                break;
        }

        const searchResults = this.bytesSequence(realParam);

        result.results = {};

        for (let i = 0; i < searchResults.length; i++) {
            const hitAddr = searchResults[i];
            result.results[hitAddr] = searchValue;
            wyff.logger.info(`${(0,_utils_hex_js__WEBPACK_IMPORTED_MODULE_0__["default"])(hitAddr)}: ${searchValue}`);
        }

        result.count = searchResults.length;

        return result;
    }

    bytesSequence(bytesSeq) {
        wyff.logger.debug("bytesSequence: entering bytes sequence search with parameter " + bytesSeq);

        if (bytesSeq.length < 1) {
            wyff.logger.error("Minimum length must be at least 1!");
            return [];
        } else if (bytesSeq.length < 4) {
            wyff.logger.debug("Sequence length is small: " + bytesSeq.length + ". This will probably return a lot of results!");
        }

        const results = [];
        const memory = this.alignedMemory("i8");
        let match = 0;

        for (let i = 0; i < memory.length; i++) {
            const thisByte = memory[i];

            if (thisByte == bytesSeq[match]) {
                match++;
                continue;
            }
            
            if (match == bytesSeq.length) {
                results.push(i - bytesSeq.length);
                match = 0;
                wyff.logger.debug("bytesSequence: sequence found: " + bytesSeq);
            } else {
                match = 0;
            }
        }

        wyff.logger.debug("bytesSequence: exiting bytes sequence search");
        return results;
    }

    readBytes(address, size = 16, intSize = 8, transformer = { asAscii: false, unsigned: true }) {
        const bytes = [];
        let buffer;
        if (intSize === 8) {
            if (transformer.unsigned) {
                buffer = new Uint8Array(this.memory.buffer);
            } else {
                buffer = new Int8Array(this.memory.buffer);
            }
        } else if (intSize === 32) {
            if (transformer.unsigned) {
                buffer = new Uint32Array(this.memory.buffer);
            } else {
                buffer = new Int32Array(this.memory.buffer);
            }
        }
        for (let i = 0; i < size; i++) {
            bytes.push(buffer[address + i]);
        }
    
        if (transformer.asAscii) {
            return bytes.map(byte => String.fromCharCode(byte)).join('');
        }
    
        return bytes;
    }
    
}

/***/ }),

/***/ "./src/utils/base64.js":
/*!*****************************!*\
  !*** ./src/utils/base64.js ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   base64ToArrayBuffer: () => (/* binding */ base64ToArrayBuffer)
/* harmony export */ });
function base64ToArrayBuffer(base64) {
    var binaryString = atob(base64);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/***/ }),

/***/ "./src/utils/hex.js":
/*!**************************!*\
  !*** ./src/utils/hex.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ toHex)
/* harmony export */ });
function toHex(i) {
	return '0x' + parseInt(i).toString(16).padStart(8, '0');
};

/***/ }),

/***/ "./src/utils/log.js":
/*!**************************!*\
  !*** ./src/utils/log.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Log)
/* harmony export */ });
function _now() {
    return new Date().toISOString().replace("T", " ").replace("Z", "");
}

const prefixStyle = [
    "font-size: 1.6em",
    "font-weight: bold",
    "text-transform: uppercase",
].join(";");

class Log {
    constructor(infoWriter, debugWriter, errorWriter) {
        this.infoWriter = infoWriter || console.log;
        this.debugWriter = debugWriter || console.debug;
        this.errorWriter = errorWriter || console.error;
    }

    info(...args) {
        this.infoWriter(`%c[WYFF]%c [${_now()}] INFO\t%s`, prefixStyle, "", ...args);
    }

    debug(...args) {
        this.debugWriter(`%c[WYFF]%c [${_now()}] DEBUG\t%s`, prefixStyle, "", ...args);
    }

    error(...args) {
        this.errorWriter(`%c[WYFF]%c [${_now()}] ERROR\t%s`, prefixStyle, "", ...args);
    }
}


/***/ }),

/***/ "./src/utils/merge.js":
/*!****************************!*\
  !*** ./src/utils/merge.js ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isObject: () => (/* binding */ isObject),
/* harmony export */   mergeDeep: () => (/* binding */ mergeDeep)
/* harmony export */ });
/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!*************************************!*\
  !*** ./src/content-script/index.js ***!
  \*************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utils_log_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/log.js */ "./src/utils/log.js");
/* harmony import */ var _hooks_remove_debugger_protection_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./hooks/remove-debugger-protection.js */ "./src/content-script/hooks/remove-debugger-protection.js");
/* harmony import */ var _hooks_wasm_triggers_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./hooks/wasm-triggers.js */ "./src/content-script/hooks/wasm-triggers.js");
/* harmony import */ var _instrumenter_instruments_encryption_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./instrumenter/instruments/encryption.js */ "./src/content-script/instrumenter/instruments/encryption.js");
/* harmony import */ var _instrumenter_instruments_decryption_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./instrumenter/instruments/decryption.js */ "./src/content-script/instrumenter/instruments/decryption.js");
/* harmony import */ var _instrumenter_index_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./instrumenter/index.js */ "./src/content-script/instrumenter/index.js");
/* harmony import */ var _memory_index_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./memory/index.js */ "./src/content-script/memory/index.js");
/* harmony import */ var _instrumenter_instruments_hook_emval_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./instrumenter/instruments/hook-emval.js */ "./src/content-script/instrumenter/instruments/hook-emval.js");
/* harmony import */ var _hooks_websocket_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./hooks/websocket.js */ "./src/content-script/hooks/websocket.js");
/* harmony import */ var _hooks_emscripten_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./hooks/emscripten.js */ "./src/content-script/hooks/emscripten.js");
/* harmony import */ var _instrumenter_instruments_memory_js__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./instrumenter/instruments/memory.js */ "./src/content-script/instrumenter/instruments/memory.js");








// import setCanvasStyles from "./hooks/set-canvas-styles.js";



// import ResourceFilesInstrument from "./instrumenter/instruments/resource-files.js";

class Wyff {
    constructor() {
        this.logger = new _utils_log_js__WEBPACK_IMPORTED_MODULE_0__["default"]();
        this.binaryInstrumenter = new _instrumenter_index_js__WEBPACK_IMPORTED_MODULE_5__["default"]();
        this.removeDebuggerProtection = new _hooks_remove_debugger_protection_js__WEBPACK_IMPORTED_MODULE_1__["default"]();
        this.hookWasmTriggers = new _hooks_wasm_triggers_js__WEBPACK_IMPORTED_MODULE_2__["default"]();
        this.websocketHooks = new _hooks_websocket_js__WEBPACK_IMPORTED_MODULE_8__["default"]();
        this.emscriptenHooks = new _hooks_emscripten_js__WEBPACK_IMPORTED_MODULE_9__["default"]();

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
        this.memoryWrapper = new _memory_index_js__WEBPACK_IMPORTED_MODULE_6__.MemoryWrapper(wasmMemory);

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
        this.binaryInstrumenter.add("memory", new _instrumenter_instruments_memory_js__WEBPACK_IMPORTED_MODULE_10__["default"]);
        this.binaryInstrumenter.add("encryption", new _instrumenter_instruments_encryption_js__WEBPACK_IMPORTED_MODULE_3__["default"]);
        this.binaryInstrumenter.add("decryption", new _instrumenter_instruments_decryption_js__WEBPACK_IMPORTED_MODULE_4__["default"]);
        // this.binaryInstrumenter.add("resource_files", new ResourceFilesInstrument);
        this.binaryInstrumenter.add("hook", new _instrumenter_instruments_hook_emval_js__WEBPACK_IMPORTED_MODULE_7__["default"]);
    }
}

window.wyff = new Wyff();
window.wyff.init();

})();

/******/ })()
;
//# sourceMappingURL=content-script.js.map