import toHex from "../../shared/utils/hex.js";

export class MemoryWrapper {

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
            wyff.logger.info(`${toHex(hitAddr)}: ${searchValue}`);
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

    readBytes(address, size = 16, intSize = 8, asAscii = false) {
        const bytes = [];
        let buffer;
        if (intSize === 8) {
            buffer = new Int8Array(this.memory.buffer);
        } else if (intSize === 32) {
            buffer = new Int32Array(this.memory.buffer);
        }
        for (let i = 0; i < size; i++) {
            bytes.push(buffer[address + i]);
        }
    
        if (asAscii) {
            return bytes.map(byte => String.fromCharCode(byte)).join('');
        }
    
        return bytes;
    }
    
}