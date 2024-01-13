export function hookFunctionUsingMatchingBytes(parser, matchingBytes, hookFunctionName, hookFunctionArgTypes, beforeHookFunctionCallCodeGenerator = null) {
    const functionsToHook = findFunctionUsingBytes(parser, matchingBytes);
    if (functionsToHook.length === 0) {
        throw new Error("Could not find function to hook using bytes");
    }

    if (functionsToHook.length > 1) {
        throw new Error("Found multiple functions to hook using bytes");
    }

    const functionToHook = functionsToHook[0];
    const hookFunctionRef = importFunction(parser, hookFunctionName, hookFunctionArgTypes);
    hookFunction(parser, functionToHook, hookFunctionRef, beforeHookFunctionCallCodeGenerator);
}

export function hookFunction(parser, functionIndex, hookFunctionRef, beforeHookFunctionCallCodeGenerator = null) {
    parser.addCodeElementParser(functionIndex, function ({ bytes }) {
        const reader = new BufferReader(bytes);

        // push the original function without the last END byte
        reader.copyBuffer(bytes.subarray(0, bytes.length - 1));

        if (beforeHookFunctionCallCodeGenerator) {
            beforeHookFunctionCallCodeGenerator(reader);
        }

        reader.copyBuffer([ OP_CALL ]);
        reader.copyBuffer(hookFunctionRef.varUint32());

        reader.copyBuffer([ OP_END ]);

        return reader.write();
    });
}