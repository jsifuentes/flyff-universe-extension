import Instrument from "./base.js";

export class Sequence {
    sequence = [];
    recordedAddressAccess = [];

    constructor(sequence) {
        this.sequence = sequence;
        this.recordedAddressAccess = sequence.map(() => []);
    }
}

export default class MemoryInstrument extends Instrument {

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