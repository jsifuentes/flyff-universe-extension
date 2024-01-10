(()=>{"use strict";function e(e){return e&&"object"==typeof e&&!Array.isArray(e)}function n(t,...r){if(!r.length)return t;const o=r.shift();if(e(t)&&e(o))for(const r in o)e(o[r])?(t[r]||Object.assign(t,{[r]:{}}),n(t[r],o[r])):Object.assign(t,{[r]:o[r]});return n(t,...r)}function t(e,n){const t=n-e,r=new Uint8Array(wasmMemory.buffer,e,t),o=new TextDecoder("ascii").decode(r);wyff.logger.info(`RECEIVED\t\t${r.join("\t")}\n${o}`)}function r(e){const n=new DataView(wasmMemory.buffer),t=n.getUint32(e,!0),r=n.getUint32(e+4,!0)-t,o=new Uint8Array(wasmMemory.buffer,t,r),i=new TextDecoder("ascii").decode(o);wyff.logger.info(`SENDING\t\t${o.join("\t")}\n${i}`)}function o(e,n,t,r){return e.addImportEntry({moduleStr:"env",fieldStr:n,kind:"func",type:e.addTypeEntry({form:"func",params:t,returnType:r})})}function i(e){return async function(i,s={}){wyff.logger.info("WebAssembly.instantiate() intercepted");const f=function(e){const n=new WailParser(e),i={env:{}};return i.env.encryptionHook=r,function(e,n){e.addCodeElementParser(2657,(function({bytes:e}){const t=new BufferReader(e);return t.copyBuffer([OP_GET_LOCAL]),t.copyBuffer(VarUint32(0)),t.copyBuffer([OP_CALL]),t.copyBuffer(n.varUint32()),t.copyBuffer(e),t.write()}))}(n,o(n,"encryptionHook",["i32"])),i.env.decryptionHook=t,function(e,n){e.addCodeElementParser(2644,(function({bytes:e}){const t=new BufferReader(e);return t.copyBuffer(e.subarray(0,e.length-1)),t.copyBuffer([OP_GET_LOCAL]),t.copyBuffer(VarUint32(0)),t.copyBuffer([OP_GET_LOCAL]),t.copyBuffer(VarUint32(1)),t.copyBuffer([OP_CALL]),t.copyBuffer(n.varUint32()),t.copyBuffer([OP_END]),t.write()}))}(n,o(n,"decryptionHook",["i32","i32"])),n.parse(),function(e,n){return{imports:e,binary:n}}(i,n.write())}(i);return f.imports&&(s=n(s,f.imports)),e(f.binary,s)}}async function s(){if(sourceObj instanceof Promise)return(await sourceObj).arrayBuffer();if(sourceObj instanceof Response)return await sourceObj.arrayBuffer();throw new Error("Got unexpected object type as first argument to WebAssembly.instantiateStreaming")}const f=new class{constructor(e,n,t){this.infoWriter=e||console.log,this.debugWriter=n||console.debug,this.errorWriter=t||console.error;const r=["font-size: 1.6em","font-weight: bold","text-transform: uppercase"].join(";");this.info=this.infoWriter.bind(console,"%c[WYFF]%c INFO\t%s",r,""),this.debug=this.debugWriter.bind(console,"%c[WYFF]%c DEBUG\t%s",r,""),this.error=this.errorWriter.bind(console,"%c[WYFF]%c ERROR\t%s",r,"")}};window.wyff={logger:f},wyff.logger.debug("hooking function to remove debugger protection"),window._Function=Function,window.Function=function(){window.c=e=>e?()=>()=>{}:null,wyff.logger.debug("debugger protection removed");const e=window._Function.apply(this,arguments);return window.Function=window._Function,e},wyff.logger.info("hooking WASM functions"),function(){const e=i(WebAssembly.instantiate);window.WebAssembly.instantiate=e}(),WebAssembly.instantiateStreaming,window.WebAssembly.instantiateStreaming=async function(e,n={}){wyff.logger.info("WebAssembly.instantiateStreaming() intercepted");const t=await s();return WebAssembly.instantiate(t,n)}})();
//# sourceMappingURL=content-script.js.map