import { decryptionFunctionHook, hookDecryptionFunction } from "./hooks/decryption.js";
import { encryptionFunctionHook, hookEncryptionFunction } from "./hooks/encryption.js";

function instrumentResults(imports, binary) {
    return { imports, binary };
}

function importFunction(parser, name, params, returnType) {
    // Add a new function into the wasm binary
    // 'env' is referring to the import object name that contains
    // all of our imports. 
    return parser.addImportEntry({
        moduleStr: "env",
        fieldStr: name,
        kind: "func",
        type: parser.addTypeEntry({
            form: "func",
            params: params,
            returnType: returnType
        })
    });
}

export default function instrumentBinary(binary) {
    const parser = new WailParser(binary);
    const imports = {
        env: {
            encryptionHook: encryptionFunctionHook,
            decryptionHook: decryptionFunctionHook
        }
    };

    // Import all functions up front so the function indexes are known
    const encryptionHookRef = importFunction(parser, "encryptionHook", ["i32"]);
    const decryptionHookRef = importFunction(parser, "decryptionHook", ["i32", "i32"]);

    try {
        hookEncryptionFunction(parser, encryptionHookRef);
    } catch (e) {
        wyff.logger.error(`error hooking encryption function`);
        wyff.logger.error(e);
    }

    try {
        hookDecryptionFunction(parser, decryptionHookRef);
    } catch (e) {
        wyff.logger.error(`error hooking decryption function`);
        wyff.logger.error(e);
    }

    // parse and write the new binary
    parser.parse();
    return instrumentResults(imports, parser.write());
}