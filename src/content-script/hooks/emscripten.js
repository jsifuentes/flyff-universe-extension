function insertIntoString(main_string, ins_string = '', pos = 0) {
    return main_string.slice(0, pos) + ins_string + main_string.slice(pos);
}

export default class EmscriptenHooks {

    init() {
        this._hookNewFunc();
        this._hookAsyncLoad();
        // this._hookBrowserObj();
    }

    _hookNewFunc() {
        const original = window.newFunc;

        window.wyff.callMethodCallback = function(handle, name, args) {
            wyff.logger.debug(`got ${handle.constructor.name}->${name}(${args.join(',')})`);
        }

        window.newFunc = function(constructor, argumentList) {
            if (constructor.name === 'Function') {
                const functionBodyIndex = argumentList.length - 1;
                const functionBody = argumentList[functionBodyIndex];
                const matchArguments = functionBody.match(/var arg[0-9]+/) || [];
                const findReturnIndex = functionBody.indexOf('var rv ='); // find the moment when the handle() is about to be called.
                const argString = [];
                for (let i = 0; i < matchArguments.length; i++) {
                    argString.push(`arg${i}`);
                }

                if (argString.length > 1) {
                    const newFunctionBody = insertIntoString(functionBody, `
                    window.wyff.callMethodCallback(handle, name, [${argString.join(',')}]);
                    `, findReturnIndex);

                    argumentList[functionBodyIndex] = newFunctionBody;
                }
            }

            return original(constructor, argumentList);
        }
    }

    _hookAsyncLoad() {
        const original = window.asyncLoad;
        window.asyncLoad = function(url, onload, onerror, noRunDep) {
            if (url.indexOf('screenfwc.bin') > -1) {
                const originalOnload = onload;
                onload = function(...args) {
                    wyff.logger.info(`loaded ${url}`);
                    debugger;
                    return originalOnload(...args);
                }
            }
            return original(url, onload, onerror, noRunDep);
        }
    }

    // _hookBrowserObj() {
    //     const original = window.Browser.mainLoop.runIter;
    //     window.Browser.mainLoop.runIter = function(...args) {
    //         wyff.logger.info(`starting an iteration: ${args[0].name}`);
    //         return original(...args);
    //     }
    // }

}