export default function findFunctionUsingBytes(parser, bytesToFind) {
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

    // set stuff up
    const bytesToFindView = new Uint8Array(buffer.write())
    const copyParser = new WailParser(parser.inBuffer);
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
                    wyff.logger.debug(`Found function using bytes`, { bytesToFindView, functionIndex, matchedBytes: codeBytes.subarray(startIndex, startIndex + bytesToFindView.length) });
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

    return matchingFunctionIndexes[0];
}