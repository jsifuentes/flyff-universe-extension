export default {
    _log: console.log,
    _debug: console.debug,

    log: function (msg) {
        this._log(`%cWYFF: ${msg}`, 'background: black; color: white; padding: 2px;');
    }
};