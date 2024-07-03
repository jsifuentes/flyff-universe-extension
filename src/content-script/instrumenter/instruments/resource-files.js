import Instrument from "./base.js";

export default class ResourceFilesInstrument extends Instrument {
    init(wailParser, bufferSource, imports) {
        this.addImport("resourceFileHook", ["i32", "i32"], null, this.resourceFileReadHook.bind(this));
        super.init(wailParser, bufferSource, imports);
    }

    instrument(importRefs) {
        const funcIndex = this.findFunctionUsingBytes([
            OP_GET_GLOBAL, VarUint32(0),
            OP_I32_CONST, VarUint32(4224),
            OP_I32_SUB,
            OP_TEE_LOCAL, 3,
            OP_SET_GLOBAL, VarUint32(0),
        ]);

        wyff.logger.info(`instrumenting the resource files function @ func${funcIndex}`);

        this.wailParser.addCodeElementParser(funcIndex, function ({ bytes }) {
            const reader = new BufferReader(bytes);

            // look through the code bytes until we find:
            //   local.get $var3
            //   i32.const 40
            //   i32.add
            //   call $func2011
            //   local.set $var4
            //   local.get $var3

            const sequence = [
                OP_GET_LOCAL, 3,
                OP_I32_CONST, 40,
                OP_I32_ADD,
                OP_CALL, '?', '?',
                // asdfafasdg
                OP_SET_LOCAL, 4,
                OP_GET_LOCAL, 3,
            ];

            let found = false;
            for (let i = 0; i < bytes.length; i++) {
                found = true;
                for (let j = 0; j < sequence.length; j++) {
                    if (sequence[j] !== '?' && bytes[i + j] !== sequence[j]) {
                        found = false;
                        break;
                    }
                }

                if (found) {
                    reader.copyBuffer(bytes.subarray(0, i + sequence.length - 4));
                    reader.copyBuffer([OP_GET_LOCAL]);
                    reader.copyBuffer(VarUint32(14));
                    reader.copyBuffer([OP_GET_LOCAL]);
                    reader.copyBuffer(VarUint32(1));
                    reader.copyBuffer([OP_CALL]);
                    reader.copyBuffer(importRefs.resourceFileHook.varUint32());
                    reader.copyBuffer(bytes.subarray(i + sequence.length - 4));

                    break;
                }
            }

            if (!found) {
                wyff.logger.error(`[resource files] could not find sequence`);
                reader.copyBuffer(bytes);
            }

            return reader.write();
        });
    }

    resourceFileReadHook(endPtr, lengthOfEverything) {
        const start = endPtr - lengthOfEverything;

        const buffer = window.wasmMemory.buffer.slice(start, start + lengthOfEverything);
        const resourceFile = new ResourceFile(buffer);

        // resourceFile.pairs.forEach((pair) => {
        //     const start = pair.key

        //     let value = '';
        //     let i = 0;
        //     while (resourceFile.stringDataBuffer[start + i] !== 0) {
        //         value += String.fromCharCode(resourceFile.stringDataBuffer[start + i]);
        //         i++;
        //     }

        //     const filename = value;
        //     wyff.logger.debug(`[resource files] found a file ${filename}`);
        // })

        // debugger;

        // wyff.logger.debug(`[resource files] hooked a file`, {
        //     resourceFile
        // });
    }
}

class ResourceFile {
    constructor(buffer) {
        this.buffer = buffer;

        this.dataview = new DataView(this.buffer);
        this._valuesIndex = this.dataview.getUint32(4 * 0, true);
        this._valuesCount = this.dataview.getUint32(4 * 1, true);
        this._objectIndex = this.dataview.getUint32(4 * 2, true);
        this._objectCount = this.dataview.getUint32(4 * 3, true);
        this._rawDataIndex = this.dataview.getUint32(4 * 4, true);
        this._rawDataCount = this.dataview.getUint32(4 * 5, true);
        this._stringDataIndex = this.dataview.getUint32(4 * 6, true);
        this._stringDataCount = this.dataview.getUint32(4 * 7, true);

        this.sections = {
            valuesBuffer: new Uint8Array(this.buffer.slice(this._valuesIndex, this.objectsIndex)),
            objectsBuffer: new Uint8Array(this.buffer.slice(this._objectIndex, this._rawDataIndex)),
            rawDataBuffer: new Uint8Array(this.buffer.slice(this._rawDataIndex, this._rawDataIndex + (8 * this._rawDataCount))),
            stringDataBuffer: new Uint8Array(this.buffer.slice(this._stringDataIndex, this._stringDataIndex + this._stringDataCount)),
        };

        this._initRawObjectPairs();
        this._initRawFileNodes();
        this._initNodes();
        this._initFileNodePairs();

        if (this.pairs.length < 2000) {
            for (let i = 0; i < this.pairs.length; i++) {
                const pair = this.pairs[i];
                wyff.logger.info(`[resource file parsed] found a file`, pair.key, pair.value, this);
            }
        } else {
            wyff.logger.info(`[resource file parsed] found ${this.pairs.length} files`);
        }
    }

    _initRawObjectPairs() {
        this.rawObjectPairs = [];

        for (let i = 0; i < this._objectCount; i++) {
            const offset = this._objectIndex + i * 8; // Each ObjectPairRaw is 8 bytes (4 bytes for key and 4 bytes for value)
            const key = this.dataview.getUint32(offset, true);
            const value = this.dataview.getUint32(offset + 4, true);
            this.rawObjectPairs.push(new RawObjectPair(key, value));
        }
    }

    _initRawFileNodes() {
        this.rawFileNodes = [];
        for (let i = 0; i < this._valuesCount; i++) {
            const offset = this._valuesIndex + (i * 8); // Each FileNodeRaw is 8 bytes (3 bits + 29 bits + 32 bits)
            const word1 = this.dataview.getUint32(offset, true);
            const type = word1 & 0x7; // Extract bits 2, 3, 4
            const size = (word1 >>> 4) & 0x1FFFFFFF; // Extract the next 29 bits
            const val = this.dataview.getUint32(offset + 4, true); // Extract the next 32 bits
            this.rawFileNodes.push(new RawFileNode(type, size, val));
        }
    }

    _initNodes() {
        this.nodes = [];
        for (let i = 0; i < this._valuesCount; i++) {
            const rawNode = this.rawFileNodes[i];
            const type = rawNode.type;

            switch (type) {
                case FileNode.Type.Null:
                    // nodes[i] = new FileNode(type, 0, null);
                    this.nodes[i] = new NullFileNode(rawNode.size, rawNode.val);
                    break;
                case FileNode.Type.Int:
                    this.nodes[i] = new IntFileNode(rawNode.val);
                    break;
                case FileNode.Type.UInt:
                    this.nodes[i] = new UIntFileNode(rawNode.val);
                    break;
                case FileNode.Type.Float:
                    this.nodes[i] = new FloatFileNode(rawNode.val);
                    break;
                case FileNode.Type.Bool:
                    this.nodes[i] = new BoolFileNode(rawNode.val);
                    break;
                case FileNode.Type.String:
                    this.nodes[i] = new StringFileNode(rawNode.size, rawNode.val);
                    break;
                case FileNode.Type.Object:
                    this.nodes[i] = new ObjectFileNode(rawNode.size, rawNode.val);
                    break;
                case FileNode.Type.Array:
                    this.nodes[i] = new ArrayFileNode(rawNode.size, rawNode.val);
                    break;
                case FileNode.Type.RawData:
                    this.nodes[i] = new RawDataFileNode(rawNode.size, rawNode.val);
                    break;
                default:
                    wyff.logger.error(`[resource files] unknown file node type: ${type}. cannot create node ${i}`, this.rawFileNodes[i]);
                    throw new Error('asfbsydgb');
            }
        }
    }

    _initFileNodePairs() {
        this.pairs = [];
        for (let i = 0; i < this._objectCount; i++) {
            const rawPair = this.rawObjectPairs[i];

            this.pairs.push(this.createNodePair(rawPair));
        }
    }

    /**
     * 
     * @param {RawObjectPair} rawPair 
     * @returns 
     */
    createNodePair(rawPair) {
        const key = new TextDecoder("utf-8").decode(this.sections.stringDataBuffer.slice(rawPair.key, this.sections.stringDataBuffer.indexOf(0, rawPair.key)));
        const node = this.nodes[rawPair.value];

        switch (node.type) {
            case FileNode.Type.Null:
                return new NullFileNodePair(key, this.sections.rawDataBuffer.slice(node.value, node.value + node.size), rawPair);
            case FileNode.Type.Int:
                return new IntFileNodePair(key, node.value, rawPair);
            case FileNode.Type.UInt:
                return new UIntFileNodePair(key, node.value, rawPair);
            case FileNode.Type.Float:
                return new FloatFileNodePair(key, node.value, rawPair);
            case FileNode.Type.Bool:
                return new BoolFileNodePair(key, node.value, rawPair);
            case FileNode.Type.String:
                return new StringFileNodePair(key, new TextDecoder("utf-8").decode(this.sections.stringDataBuffer.slice(node.value, node.value + node.size)), rawPair);
            case FileNode.Type.Object:
                return new ObjectFileNodePair(key, this.pairs[node.value], rawPair);
            case FileNode.Type.Array:
                return new ArrayFileNodePair(key, this.nodes[node.value], rawPair);
            case FileNode.Type.RawData:
                return new RawDataFileNodePair(key, this.sections.rawDataBuffer.slice(node.value, node.size), rawPair);
            default:
                throw new Error(`[resource files] unknown file node type: ${node.type}`);
        }
    }
}

class RawObjectPair {
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
}

class FileNodePair {
    constructor(key, value, _fromRawObjectPair) {
        this.key = key;
        this.value = value;
        this._fromRawObjectPair = _fromRawObjectPair;
    }
}

class NullFileNodePair extends FileNodePair {}
class IntFileNodePair extends FileNodePair {}
class UIntFileNodePair extends FileNodePair {}
class FloatFileNodePair extends FileNodePair {}
class BoolFileNodePair extends FileNodePair {}
class StringFileNodePair extends FileNodePair {}
class ObjectFileNodePair extends FileNodePair {}
class ArrayFileNodePair extends FileNodePair {}
class RawDataFileNodePair extends FileNodePair {}

class RawFileNode {
    constructor(type, size, val) {
        this.type = type;
        this.size = size;
        this.val = val;
    }
}

class FileNode {
    constructor(type, size, value) {
        this.type = type;
        this.size = size;
        this.value = value;
    }

    static Type = {
        Null: 0,
		Bool: 1,
		Int: 2,
		UInt: 3,
		Float: 4,
		String: 5,
		Array: 6,
		Object: 7,
		RawData: 8
    }
}

class NullFileNode extends FileNode {
    constructor(size, value) {
        super(FileNode.Type.Null, size, value);
    }
}

class BoolFileNode extends FileNode {
    constructor(value) {
        super(FileNode.Type.Bool, null, value);
    }
}

class IntFileNode extends FileNode {
    constructor(value) {
        super(FileNode.Type.Int, null, value);
    }
}

class UIntFileNode extends FileNode {
    constructor(value) {
        super(FileNode.Type.UInt, null, value);
    }
}

class FloatFileNode extends FileNode {
    constructor(value) {
        super(FileNode.Type.Float, null, value);
    }
}

class StringFileNode extends FileNode {
    constructor(size, val) {
        super(FileNode.Type.String, size, val);
    }
}

class ObjectFileNode extends FileNode {
    constructor(size, val) {
        super(FileNode.Type.Object, size, val);
    }
}

class ArrayFileNode extends FileNode {
    constructor(size, val) {
        super(FileNode.Type.Array, size, val);
    }
}

class RawDataFileNode extends FileNode {
    constructor(size, val) {
        super(FileNode.Type.RawData, size, val);
    }
}
