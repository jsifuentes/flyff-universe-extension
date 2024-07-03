import Instrument from "./base.js";

export default class EncryptionInstrument extends Instrument {
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