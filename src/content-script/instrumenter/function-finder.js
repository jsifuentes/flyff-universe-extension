export default class FunctionFinder {
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