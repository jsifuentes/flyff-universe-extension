import FunctionFinder from "../function-finder.js";

function findKeyFromFunctionName(imports, functionName) {
    const keys = Object.keys(imports);
    const index = keys.findIndex(x => imports[x].name === functionName);
    if (index === -1) {
        return null;
    }

    return keys[index];
}

export default class Instrument {
    PARENT_IMPORTS_KEY = "a"; // all emscripten imports are under imports['a']
    PARENT_NEW_IMPORTS_KEY = "env" // all new imports will live under imports['env']

    wailParser = null;
    binarySource = null;
    imports = {};
    replacedImports = {};
    addedImports = {}

    init(wailParser, binarySource, imports = {}) {
        this.wailParser = wailParser;
        this.binarySource = binarySource;
        this.imports = imports;
    }

    hookImport(originalFunctionName, hookFunction) {
        const key = findKeyFromFunctionName(this.imports[this.PARENT_IMPORTS_KEY], originalFunctionName);
        if (!key) {
            throw new Error(`could not find wasm import using function name ${originalFunctionName}`);
        }
        const originalFunction = this.imports[this.PARENT_IMPORTS_KEY][key];
        const newFunction = function(...args) {
            return hookFunction(originalFunction, ...args);
        }

        this.replacedImports[this.PARENT_IMPORTS_KEY] = this.replacedImports[this.PARENT_IMPORTS_KEY] || {}
        this.replacedImports[this.PARENT_IMPORTS_KEY][key] = newFunction;
    }

    addImport(name, params, returnType, callable) {
        this.addedImports[name] = {
            params,
            returnType,
            callable
        };
    }

    findFunctionUsingBytes(bytesPattern) {
        const functionFinder = new FunctionFinder(this.wailParser);
        return functionFinder.findFunction(bytesPattern);
    }

}