import FunctionFinder from "../function-finder";
import Instrument from "./base.js";

export default class DecryptionInstrument extends Instrument {

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