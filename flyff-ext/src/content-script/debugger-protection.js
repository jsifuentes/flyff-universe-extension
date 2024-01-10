export default function removeDebuggerProtection(logger) {
    wyff.logger.debug(`hooking function to remove debugger protection`);

    window._Function = Function;
    window.Function = function() {
        window.c = (a) => (a ? () => () => {} : null);
        wyff.logger.debug(`debugger protection removed`);
        const fn = window._Function.apply(this, arguments);
        window.Function = window._Function;
        return fn;
    };
}