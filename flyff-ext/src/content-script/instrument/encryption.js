export function encryptionFunctionHook(ptr) {
    const dataview = new DataView(wasmMemory.buffer);
    const beginningOfMsgPtr = dataview.getUint32(ptr, true);
    const endOfMsgPtr = dataview.getUint32(ptr + 4, true);
    const messageLength = endOfMsgPtr - beginningOfMsgPtr;
    const message = new Uint8Array(wasmMemory.buffer, beginningOfMsgPtr, messageLength);

    const messageAscii = new TextDecoder("ascii").decode(message);
    wyff.logger.info(`Sending message to server: ${messageAscii} [${message.join("\t")}]`);
}

export function hookEncryptionFunction(parser, hookRef) {
    parser.addCodeElementParser(2656, function ({ bytes }) {
        const reader = new BufferReader(bytes);

        // push the first arg of the function onto the stack
        reader.copyBuffer([ OP_GET_LOCAL ]);
        reader.copyBuffer(VarUint32(0x00));
        // call the hook function
        reader.copyBuffer([ OP_CALL ]);
        reader.copyBuffer(hookRef.varUint32());

        // push the rest of the function
        reader.copyBuffer(bytes);
        return reader.write();
    });
}