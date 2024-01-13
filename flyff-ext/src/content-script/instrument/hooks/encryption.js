import { uint64ToUint8Array } from "../../../shared/utils/bytes";
import findFunctionUsingBytes from "../find-function";

export function encryptionFunctionHook(ptr) {
    /**
     * Now we have the address of the beginning of the message payload
     * var0+4 is an address that contains the address of the end of the message payload
     */
    const dataview = new DataView(wasmMemory.buffer);

    const beginningOfMsgPtr = dataview.getUint32(ptr, true);
    const endOfMsgPtr = dataview.getUint32(ptr + 4, true);

    // calculate length using addresses
    const messageLength = endOfMsgPtr - beginningOfMsgPtr;
    // get the message
    const message = new Uint8Array(wasmMemory.buffer, beginningOfMsgPtr, messageLength);
    // convert to ascii
    const messageAscii = new TextDecoder("ascii").decode(message);

    wyff.logger.info(`SENDING\n%c${message.join("\t")}%c\n%c${messageAscii}`, 'background: #c4ffcd; color: black;', '', 'background: #a7facd; color: black;');
}

export function hookEncryptionFunction(parser, hookRef) {
    const functionIndex = findFunctionUsingBytes(parser, [
        /**
         * These bytes are like the very beginning of the encryption function
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

    wyff.logger.info(`Found encryption function`, { functionIndex });

    parser.addCodeElementParser(parser._getAdjustedFunctionIndex(functionIndex), function ({ bytes }) {
        const reader = new BufferReader(bytes);

        /**
         * At the beginning of the encryption function, var0 is a memory address
         * that contains the address of the beginning of the message payload.
         */

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