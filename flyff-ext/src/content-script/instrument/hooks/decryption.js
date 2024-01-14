import findFunctionUsingBytes from "../find-function";
import handleMessageByCommand from "./received-hooks";

export function decryptionFunctionHook(beginAddress, endAddress) {
    // Using the beginAddress and endAddress, we can get the message payload
    const length = endAddress - beginAddress;
    const message = new Uint8Array(new Uint8Array(wasmMemory.buffer, beginAddress, length));

    const first4Bytes = message.slice(4, 8);
    const first4BytesUint32 = new Uint32Array(first4Bytes.buffer)[0];
    let cmdNumber = first4BytesUint32;

    handleMessageByCommand(cmdNumber, message);

    // convert to ascii
    const messageAscii = new TextDecoder("ascii").decode(message);
    wyff.logger.debug(`RECEIVED (cmd: ${cmdNumber} \n%c${message.join("\t")}%c\n%c${messageAscii}`, 'background: #c4e2ff; color: black;', '', 'background: #c4d0ff; color: black;', {
        buffer: message,
    });
}

export function hookDecryptionFunction(parser, hookRef) {
    const functionIndex = findFunctionUsingBytes(parser, [
        OP_GET_LOCAL, VarUint32(0x02),
        OP_I32_LOAD, VarUint32(0x02), VarUint32(36),
        OP_I32_LOAD, 0x00, VarUint32(5),
    ]);

    wyff.logger.info(`Found decryption function`, { functionIndex });

    parser.addCodeElementParser(parser._getAdjustedFunctionIndex(functionIndex), function ({ bytes }) {
        const reader = new BufferReader(bytes);

        // push the original function without the last END byte
        reader.copyBuffer(bytes.subarray(0, bytes.length - 1));

        /**
         * At the very end of the decryption function,
         * var0 is a memory address that contains the address of the beginning of the message payload.
         * var1 is a memory address that contains the address of the end of the message payload.
         */
        reader.copyBuffer([ OP_GET_LOCAL ]);
        reader.copyBuffer(VarUint32(0x00));
        reader.copyBuffer([ OP_GET_LOCAL ]);
        reader.copyBuffer(VarUint32(0x01));
        reader.copyBuffer([ OP_CALL ]);
        reader.copyBuffer(hookRef.varUint32());

        reader.copyBuffer([ OP_END ]);

        return reader.write();
    });
}