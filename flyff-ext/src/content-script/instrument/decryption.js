export function decryptionFunctionHook(beginAddress, endAddress) {
    const length = endAddress - beginAddress;
    const message = new Uint8Array(wasmMemory.buffer, beginAddress, length);

    const messageAscii = new TextDecoder("ascii").decode(message);
    wyff.logger.info(`RECEIVED\n%c${message.join("\t")}%c\n%c${messageAscii}`, 'background: cyan', '', 'background: #00d4d4');
}

export function hookDecryptionFunction(parser, hookRef) {
    parser.addCodeElementParser(2644, function ({ bytes }) {
        const reader = new BufferReader(bytes);

        // push the original function without the last END byte
        reader.copyBuffer(bytes.subarray(0, bytes.length - 1));

        /**
         * I think the address for the beginning of the decrpyted payload
         * is located at var2+20. so &var2+20 = length byte for the message.
         * (&var2+20)+4 is the first byte of the message
         */

        // Get var 2 and call decryption hook
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