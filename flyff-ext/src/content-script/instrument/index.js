import { decryptionFunctionHook, hookDecryptionFunction } from "./decryption.js";
import { encryptionFunctionHook, hookEncryptionFunction } from "./encryption";

function instrumentResults(imports, binary) {
    return { imports, binary };
}

function importFunction(parser, name, params, returnType) {
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
    const imports = { env: {} };

    imports.env.encryptionHook = encryptionFunctionHook;
    const encryptionHookRef = importFunction(parser, "encryptionHook", ["i32"]);
    hookEncryptionFunction(parser, encryptionHookRef);

    imports.env.decryptionHook = decryptionFunctionHook;
    const decryptionHookRef = importFunction(parser, "decryptionHook", ["i32", "i32"]);
    hookDecryptionFunction(parser, decryptionHookRef);

    parser.parse();
    return instrumentResults(imports, parser.write());
}