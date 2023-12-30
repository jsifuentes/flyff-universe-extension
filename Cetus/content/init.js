/**
Copyright 2020 Jack Baker

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Inform the extension when we leave the page
window.onbeforeunload = function() {
    // Don't bother sending a reset message if Cetus didn't initialize.
    // This helps keep unrelated tabs from resetting the extension
    if (cetusInstances !== null) {
        cetusInstances.closeAll();
    }
};

const MAX_WATCHPOINTS = 10;

const ENABLE_WP_NONE  = 0;
const ENABLE_WP_READ  = 1;
const ENABLE_WP_WRITE = 2;
const ENABLE_WP_FREEZE = 4;
const ENABLE_WP_ALL   = ENABLE_WP_READ | ENABLE_WP_WRITE | ENABLE_WP_FREEZE;

// This function performs the main instrumentation logic of taking a
// a WebAssembly binary, making necessary additions/modifications, and
// returning the resulting binary
const instrumentBinary = function(bufferSource) {
    let instrumentLevel = ENABLE_WP_ALL;
    let wpCount = 3;

    if (typeof cetusOptions === "object") {
        if (typeof cetusOptions.enableWatchpoints === "string") {
            instrumentLevel = parseInt(cetusOptions.enableWatchpoints);
        }
        if (typeof cetusOptions.wpCount === "string") {
            wpCount = parseInt(cetusOptions.wpCount);
        }
    }

    if (wpCount > MAX_WATCHPOINTS || wpCount < 0) {
        colorError("Invalid WP count!");
        return;
    }

    if (wpCount == 0 && instrumentLevel) {
        colorError("WP count is 0 but watchpoints are not disabled!");
        return;
    }

    if (cetusInstances.logLevel >= LOG_LEVEL_DEBUG) {
        colorLog("Instrumenting with flags " + instrumentLevel);
    }

    const wail = new WailParser();

    // TODO Would this be cleaner/quicker as a TABLE entry?
    const wpConfigs = [];
    let funcEntryReadWatchpointRouter;
    let funcEntryWriteWatchpointRouter;

    // const importMemory = wail.addImportEntry({
    //     moduleStr: "env",
    //     fieldStr: "mem",
    //     kind: "memory"
    // });

    if (instrumentLevel) {
        const funcTypeWatchCallback = wail.addTypeEntry({
            form: "func",
            params: [],
        });

        const globalWatchFlags = wail.addGlobalEntry({
            globalType: {
                contentType: "i32",
                mutability: true,
            },
            initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
        });

        const globalAreWriteWatchpointsEnabled = wail.addGlobalEntry({
            globalType: {
                contentType: "i32",
                mutability: true,
            },
            initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
        });

        const globalAreReadWatchpointsEnabled = wail.addGlobalEntry({
            globalType: {
                contentType: "i32",
                mutability: true,
            },
            initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
        });

        // See the actual code entry for this function for a full explanation of why
        // we need to split value into upper and lower halves
        const funcTypeConfigWatchpoint = wail.addTypeEntry({
            form: "func",
            // addr, value_lower, value_upper, size, flags
            params: [ "i32", "i32", "i32", "i32", "i32" ],
        });

        for (let i = 0; i < wpCount; i++) {
            const thisWP = {};

            thisWP.globalAddr = wail.addGlobalEntry({
                globalType: {
                    contentType: "i32",
                    mutability: true,
                },
                initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
            });

            thisWP.globalVal = wail.addGlobalEntry({
                globalType: {
                    contentType: "i64",
                    mutability: true,
                },
                initExpr: [ OP_I64_CONST, VarUint32(0x00), OP_END ]
            });

            thisWP.globalSize = wail.addGlobalEntry({
                globalType: {
                    contentType: "i32",
                    mutability: true,
                },
                initExpr: [ OP_I32_CONST, VarUint32(0x00), OP_END ]
            });

            const thisFuncEntry = wail.addFunctionEntry({
                type: funcTypeConfigWatchpoint,
            });

            wail.addExportEntry(thisFuncEntry, {
                fieldStr: "configWatch" + i,
                kind: "func",
            });

            let allReadFlags = 0;
            let allWriteFlags = 0;

            for (let i = 0; i < wpCount; i++) {
                allReadFlags |= ENABLE_WP_READ << (3 * i);
                allWriteFlags |= (ENABLE_WP_WRITE | ENABLE_WP_FREEZE) << (3 * i);
            }

            //
            // This function is called to configure a watchpoint by setting the associated
            // global variables.
            // Once mutable external global variables are widely supported by browsers, this
            // can be done from Javascript and this function can be removed
            //
            // Exported functions cannot have i64/f64 as arguments at time of writing. So in
            // order to support 64-bit watchpoint values, we need to pass the upper/lower
            // 32-bits as separate arguments. We then recombine them and set thisWatchVal
            //
            // Arguments:
            //  local_0 = watch address
            //  local_1 = watch value lower
            //  local_2 = watch value upper
            //  local_3 = watch size
            //  local_4 = watch flags
            //
            wail.addCodeEntry(thisFuncEntry, {
                locals: [ "i32", ],
                code: [
                    // globalAddr = arg_0
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_SET_GLOBAL, thisWP.globalAddr.varUint32(),

                    // globalVal = (arg_1 | (arg_2 << 32))
                    OP_GET_LOCAL, VarUint32(0x01),
                    OP_I64_EXTEND_U_I32,
                    OP_GET_LOCAL, VarUint32(0x02),
                    OP_I64_EXTEND_U_I32,
                    OP_I64_CONST, VarUint32(0x20),
                    OP_I64_SHL,
                    OP_I64_OR,
                    OP_SET_GLOBAL, thisWP.globalVal.varUint32(),

                    // globalSize = arg_3
                    OP_GET_LOCAL, VarUint32(0x03),
                    OP_SET_GLOBAL, thisWP.globalSize.varUint32(),

                    // Remove the old flags for this watchpoint
                    // zeroMask = (ENABLE_WP_ALL << (3 * i)) ^ 0x3FFFFFFF
                    // globalWatchFlags = globalWatchFlags & zeroMask
                    OP_I32_CONST, VarUint32((ENABLE_WP_ALL << (3 * i)) ^ 0x3FFFFFFF),
                    OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    OP_I32_AND,
                    OP_SET_GLOBAL, globalWatchFlags.varUint32(),
            
                    // Set the new flags
                    // globalWatchFlags = globalWatchFlags | (arg_4 << (3 * i)
                    OP_GET_LOCAL, VarUint32(0x04),
                    OP_I32_CONST, VarUint32(ENABLE_WP_ALL),
                    OP_I32_AND,
                    OP_I32_CONST, VarUint32(3 * i),
                    OP_I32_SHL,
                    OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    OP_I32_OR,
                    OP_SET_GLOBAL, globalWatchFlags.varUint32(),

                    // Set globalAreReadWatchpointsEnabled
                    OP_I32_CONST, VarUint32(0x00),
                    OP_SET_LOCAL, VarUint32(0x00),
                    OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    OP_I32_CONST, VarUint32(allReadFlags),
                    OP_I32_AND,
                    OP_IF, 0x40,
                        OP_I32_CONST, VarUint32(0x01),
                        OP_SET_LOCAL, VarUint32(0x00),
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_SET_GLOBAL, globalAreReadWatchpointsEnabled.varUint32(),

                    // Set globalAreWriteWatchpointsEnabled
                    OP_I32_CONST, VarUint32(0x00),
                    OP_SET_LOCAL, VarUint32(0x00),
                    OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    OP_I32_CONST, VarUint32(allWriteFlags),
                    OP_I32_AND,
                    OP_IF, 0x40,
                        OP_I32_CONST, VarUint32(0x01),
                        OP_SET_LOCAL, VarUint32(0x00),
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_SET_GLOBAL, globalAreWriteWatchpointsEnabled.varUint32(),

                    OP_RETURN,
                    OP_END,
                ]
            });

            thisWP.funcEntry = thisFuncEntry;

            wpConfigs.push(thisWP);
        }

        if (instrumentLevel & ENABLE_WP_WRITE) {
            const funcTypeWriteWatchpointRouter = wail.addTypeEntry({
                form: "func",
                params: [],
            });

            const funcTypeWriteWatchpoint = wail.addTypeEntry({
                form: "func",
                params: [ "i32", "i64", "i32", "i32" ],
                returnType: "i64",
            });

            funcEntryWriteWatchpointRouter = wail.addFunctionEntry({
                type: funcTypeWriteWatchpointRouter,
            });

            const funcEntryWriteWatchpoint8Bit = wail.addFunctionEntry({
                type: funcTypeWriteWatchpoint,
            });

            const funcEntryWriteWatchpoint16Bit = wail.addFunctionEntry({
                type: funcTypeWriteWatchpoint,
            });

            const funcEntryWriteWatchpoint32Bit = wail.addFunctionEntry({
                type: funcTypeWriteWatchpoint,
            });

            const funcEntryWriteWatchpoint64Bit = wail.addFunctionEntry({
                type: funcTypeWriteWatchpoint,
            });

            const importWriteWatchFunc = wail.addImportEntry({
                moduleStr: "env",
                fieldStr: "writeWatchCallback",
                kind: "func",
                type: funcTypeWatchCallback
            });

            const codeRoutes = [];

            for (let i = 0; i < wpCount; i++) {
                const thisConfig = wpConfigs[i];

                const thisRoute = [
                    OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    OP_I32_CONST, VarUint32((ENABLE_WP_WRITE | ENABLE_WP_FREEZE) << (3 * i)),
                    OP_I32_AND,
                    OP_IF, 0x40,
                        OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                        OP_TEE_LOCAL, VarUint32(0x00),
                        OP_I32_CONST, VarUint32(0x01),
                        OP_I32_EQ,
                        OP_IF, 0x40,
                            OP_GET_GLOBAL, thisConfig.globalAddr.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                            OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                            OP_I32_CONST, VarUint32(3 * i),
                            OP_I32_SHR_U,
                            OP_CALL, funcEntryWriteWatchpoint8Bit.varUint32(),
                            OP_SET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_BR, VarUint32(0x01),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x00),
                        OP_I32_CONST, VarUint32(0x02),
                        OP_I32_EQ,
                        OP_IF, 0x40,
                            OP_GET_GLOBAL, thisConfig.globalAddr.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                            OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                            OP_I32_CONST, VarUint32(3 * i),
                            OP_I32_SHR_U,
                            OP_CALL, funcEntryWriteWatchpoint16Bit.varUint32(),
                            OP_SET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_BR, VarUint32(0x01),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x00),
                        OP_I32_CONST, VarUint32(0x04),
                        OP_I32_EQ,
                        OP_IF, 0x40,
                            OP_GET_GLOBAL, thisConfig.globalAddr.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                            OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                            OP_I32_CONST, VarUint32(3 * i),
                            OP_I32_SHR_U,
                            OP_CALL, funcEntryWriteWatchpoint32Bit.varUint32(),
                            OP_SET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_BR, VarUint32(0x01),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x00),
                        OP_I32_CONST, VarUint32(0x08),
                        OP_I32_EQ,
                        OP_IF, 0x40,
                            OP_GET_GLOBAL, thisConfig.globalAddr.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                            OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                            OP_I32_CONST, VarUint32(3 * i),
                            OP_I32_SHR_U,
                            OP_CALL, funcEntryWriteWatchpoint64Bit.varUint32(),
                            OP_SET_GLOBAL, thisConfig.globalVal.varUint32(),
                            OP_BR, VarUint32(0x01),
                        OP_END,
                    OP_END,
                ];

                codeRoutes.push(thisRoute);
            }

            const routerCode = [];

            // for (let i = 0; i < wpCount; i++) {
            //     const thisRoute = codeRoutes[i];
            //     for (let j = 0; j < thisRoute.length; j++) {
            //         routerCode.push(thisRoute[j]);
            //     }
            // }

            routerCode.push(OP_RETURN);
            routerCode.push(OP_END);

            //
            // This function routes a watchpoint check to the correct handler depending on the size of the configured watchpoint
            // (1, 2, 4, or 8 bytes)
            //
            wail.addCodeEntry(funcEntryWriteWatchpointRouter, {
                locals: [ "i32" ],
                code: routerCode
            });

            //
            // Arguments:
            //  local_0 = watch addr
            //  local_1 = watch value
            //  local_2 = watch size
            //  local_3 = watch flags
            //
            // Returns the current value of the watchpoint
            //
            // TODO This would be more correct if it triggered the write watchpoint even when writing the same value
            wail.addCodeEntry(funcEntryWriteWatchpoint8Bit, {
                locals: [ "i64" ],
                code: [
                    // We have already checked that globalWatchAddr != 0 so we start by making sure the
                    // value of our watched address has changed
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_I64_LOAD8_U, VarUint32(0x00), VarUint32(0x00),
                    OP_TEE_LOCAL, VarUint32(0x04),
                    OP_GET_LOCAL, VarUint32(0x01),
                    OP_I64_NE,
                    OP_IF, 0x40,
                        // If our watched value has changed since we last looked,
                        // we check which flags are set for our watchpoint
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_WRITE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // WRITE flag is set, trigger imported callback
                            OP_CALL, importWriteWatchFunc.varUint32(),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_FREEZE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // FREEZE flag is set, revert the value
                            OP_GET_LOCAL, VarUint32(0x00),
                            OP_GET_LOCAL, VarUint32(0x01),
                            OP_TEE_LOCAL, VarUint32(0x04),
                            OP_I64_STORE8, VarUint32(0x00), VarUint32(0x00),
                        OP_END,
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x04),
                    OP_RETURN,
                    OP_END,
                ]
            });

            wail.addCodeEntry(funcEntryWriteWatchpoint16Bit, {
                locals: [ "i64" ],
                code: [
                    // We have already checked that globalWatchAddr != 0 so we start by making sure the
                    // value of our watched address has changed
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_I64_LOAD16_U, VarUint32(0x00), VarUint32(0x00),
                    OP_TEE_LOCAL, VarUint32(0x04),
                    OP_GET_LOCAL, VarUint32(0x01),
                    OP_I64_NE,
                    OP_IF, 0x40,
                        // If our watched value has changed since we last looked,
                        // we check which flags are set for our watchpoint
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_WRITE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // WRITE flag is set, trigger imported callback
                            OP_CALL, importWriteWatchFunc.varUint32(),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_FREEZE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // FREEZE flag is set, revert the value
                            OP_GET_LOCAL, VarUint32(0x00),
                            OP_GET_LOCAL, VarUint32(0x01),
                            OP_TEE_LOCAL, VarUint32(0x04),
                            OP_I64_STORE16, VarUint32(0x00), VarUint32(0x00),
                        OP_END,
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x04),
                    OP_RETURN,
                    OP_END,
                ]
            });

            wail.addCodeEntry(funcEntryWriteWatchpoint32Bit, {
                locals: [ "i64" ],
                code: [
                    // We have already checked that globalWatchAddr != 0 so we start by making sure the
                    // value of our watched address has changed
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_I64_LOAD32_U, VarUint32(0x00), VarUint32(0x00),
                    OP_TEE_LOCAL, VarUint32(0x04),
                    OP_GET_LOCAL, VarUint32(0x01),
                    OP_I64_NE,
                    OP_IF, 0x40,
                        // If our watched value has changed since we last looked,
                        // we check which flags are set for our watchpoint
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_WRITE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // WRITE flag is set, trigger imported callback
                            OP_CALL, importWriteWatchFunc.varUint32(),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_FREEZE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // FREEZE flag is set, revert the value
                            OP_GET_LOCAL, VarUint32(0x00),
                            OP_GET_LOCAL, VarUint32(0x01),
                            OP_TEE_LOCAL, VarUint32(0x04),
                            OP_I64_STORE32, VarUint32(0x00), VarUint32(0x00),
                        OP_END,
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x04),
                    OP_RETURN,
                    OP_END,
                ]
            });

            wail.addCodeEntry(funcEntryWriteWatchpoint64Bit, {
                locals: [ "i64" ],
                code: [
                    // We have already checked that globalWatchAddr != 0 so we start by making sure the
                    // value of our watched address has changed
                    OP_GET_LOCAL, VarUint32(0x00),
                    OP_I64_LOAD, VarUint32(0x00), VarUint32(0x00),
                    OP_TEE_LOCAL, VarUint32(0x04),
                    OP_GET_LOCAL, VarUint32(0x01),
                    OP_I64_NE,
                    OP_IF, 0x40,
                        // If our watched value has changed since we last looked,
                        // we check which flags are set for our watchpoint
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_WRITE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // WRITE flag is set, trigger imported callback
                            OP_CALL, importWriteWatchFunc.varUint32(),
                        OP_END,
                        OP_GET_LOCAL, VarUint32(0x03),
                        OP_I32_CONST, VarUint32(ENABLE_WP_FREEZE),
                        OP_I32_AND,
                        OP_IF, 0x40,
                            // FREEZE flag is set, revert the value
                            OP_GET_LOCAL, VarUint32(0x00),
                            OP_GET_LOCAL, VarUint32(0x01),
                            OP_TEE_LOCAL, VarUint32(0x04),
                            OP_I64_STORE, VarUint32(0x00), VarUint32(0x00),
                        OP_END,
                    OP_END,
                    OP_GET_LOCAL, VarUint32(0x04),
                    OP_RETURN,
                    OP_END,
                ]
            });
        }

        if (instrumentLevel & ENABLE_WP_READ) {
            const funcTypeReadWatchpointRouter = wail.addTypeEntry({
                form: "func",
                params: [ "i32", "i32", "i32" ],
                returnType: "i32",
            });

            const funcTypeReadWatchpoint = wail.addTypeEntry({
                form: "func",
                params: [ "i32", "i32", "i32", "i32", "i32" ],
            });

            funcEntryReadWatchpointRouter = wail.addFunctionEntry({
                type: funcTypeReadWatchpointRouter,
            });

            const funcEntryReadWatchpoint = wail.addFunctionEntry({
                type: funcTypeReadWatchpoint,
            });

            // const funcTypeReadWatchpoint = wail.addTypeEntry({
            const importReadWatchFunc = wail.addImportEntry({
                moduleStr: "env",
                fieldStr: "readWatchCallback",
                kind: "func",
                type: funcTypeWatchCallback
            });

            const codeRoutes = [];

            for (let i = 0; i < wpCount; i++) {
                const thisConfig = wpConfigs[i];

                const thisRoute = [
                    // OP_GET_GLOBAL, globalWatchFlags.varUint32(),
                    // OP_I32_CONST, VarUint32(ENABLE_WP_READ << (3 * i)),
                    // OP_I32_AND,
                    // OP_IF, 0x40,
                        OP_GET_LOCAL, VarUint32(0x00),
                        OP_GET_LOCAL, VarUint32(0x01),
                        OP_GET_LOCAL, VarUint32(0x02),
                        OP_GET_GLOBAL, thisConfig.globalAddr.varUint32(),
                        OP_GET_GLOBAL, thisConfig.globalSize.varUint32(),
                        OP_CALL, funcEntryReadWatchpoint.varUint32(),
                    // OP_END,
                ];

                codeRoutes.push(thisRoute);
            }

            const routerCode = [];

            // routerCode.push(OP_GET_GLOBAL);
            // routerCode.push(globalAreReadWatchpointsEnabled.varUint32());
            // routerCode.push(OP_IF);
            // routerCode.push(0x40);

            for (let i = 0; i < wpCount; i++) {
                const thisRoute = codeRoutes[i];
                for (let j = 0; j < thisRoute.length; j++) {
                    routerCode.push(thisRoute[j]);
                }
            }

            // routerCode.push(OP_END);
            routerCode.push(OP_GET_LOCAL);
            routerCode.push(VarUint32(0x00));
            routerCode.push(OP_RETURN);
            routerCode.push(OP_END);

            //
            // This function routes a memory read to the handler function for any enabled read watchpoints
            //
            // Arguments:
            //  local_0 = base pointer
            //  local_1 = load offset
            //  local_2 = load size
            //
            wail.addCodeEntry(funcEntryReadWatchpointRouter, {
                locals: [],
                code: routerCode
            });

            //
            // This function is the primary logic for read watch points. It takes an
            // address, offset, and size of an attempted memory load and calculates
            // whether that load will read from a watchpoint address. If so, it calls
            // the registered watchpoint callback
            //
            // Arguments:
            //  local_0 = base pointer
            //  local_1 = load offset
            //  local_2 = load size
            //  local_3 = wp addr
            //  local_4 = wp size
            //
            wail.addCodeEntry(funcEntryReadWatchpoint, {
                locals: [],
                code: [
                    OP_BLOCK, 0x40,
                        // OP_GET_LOCAL, VarUint32(0x03),
                        // OP_GET_LOCAL, VarUint32(0x04),
                        // OP_I32_ADD,
                        // OP_GET_LOCAL, VarUint32(0x00),
                        // OP_GET_LOCAL, VarUint32(0x01),
                        // OP_I32_ADD,
                        // OP_I32_LT_U,
                        // OP_BR_IF, VarUint32(0x00),
                        // OP_GET_LOCAL, VarUint32(0x03),
                        // OP_GET_LOCAL, VarUint32(0x00),
                        // OP_GET_LOCAL, VarUint32(0x01),
                        // OP_I32_ADD,
                        // OP_GET_LOCAL, VarUint32(0x02),
                        // OP_I32_ADD,
                        // OP_I32_GT_U,
                        // OP_BR_IF, VarUint32(0x00),
                        OP_CALL, importReadWatchFunc.varUint32(),
                    OP_END,
                    OP_RETURN,
                    OP_END,
                ]
            });
        }

        // TODO Comment description
        const readWatchpointInstrCallback = function(instrBytes) {
            const reader = new BufferReader(instrBytes);

            const opcode = reader.readUint8();

            const flags = reader.readVarUint32();
            const offset = reader.readVarUint32();

            const pushSizeOpcode = [ OP_I32_CONST ];

            let pushSizeImmediate;
            let arg;

            switch (opcode) {
                case OP_I32_LOAD8_S:
                case OP_I32_LOAD8_U:
                case OP_I64_LOAD8_S:
                case OP_I64_LOAD8_U:
                    pushSizeImmediate = VarUint32(1);
                    break;
                case OP_I32_LOAD16_S:
                case OP_I32_LOAD16_U:
                case OP_I64_LOAD16_S:
                case OP_I64_LOAD16_U:
                    pushSizeImmediate = VarUint32(2);
                    break;
                case OP_I32_LOAD:
                case OP_F32_LOAD:
                case OP_I64_LOAD32_S:
                case OP_I64_LOAD32_U:
                    pushSizeImmediate = VarUint32(4);
                    break;
                case OP_I64_LOAD:
                case OP_F64_LOAD:
                    pushSizeImmediate = VarUint32(8);
                    break;
                case OP_SIMD:
                    arg = instrBytes[1];
                    switch(arg) {
                        case SIMD_V128_LOAD8_SPLAT:
                            pushSizeImmediate = VarUint32(1);
                            break;
                        case SIMD_V128_LOAD16_SPLAT:
                            pushSizeImmediate = VarUint32(2);
                            break;
                        case SIMD_V128_LOAD32_ZERO:
                        case SIMD_V128_LOAD32_SPLAT:
                            pushSizeImmediate = VarUint32(4);
                            break;
                        case SIMD_V128_LOAD8X8_S:
                        case SIMD_V128_LOAD8X8_U:
                        case SIMD_V128_LOAD16X4_S:
                        case SIMD_V128_LOAD16X4_U:
                        case SIMD_V128_LOAD32X2_S:
                        case SIMD_V128_LOAD32X2_U:
                        case SIMD_V128_LOAD64_SPLAT:
                        case SIMD_V128_LOAD64_ZERO:
                            pushSizeImmediate = VarUint32(8);
                            break;
                        case SIMD_V128_LOAD:
                            pushSizeImmediate = VarUint32(16);
                            break;
                    }
                    break;
                case OP_ATOMIC:
                    arg = instrBytes[1];
                    switch(arg) {
                        case ARG_I32_ATOMIC_LOAD:
                        case ARG_I64_ATOMIC_LOAD_32U:
                            pushSizeImmediate = VarUint32(4);
                            break;
                        case ARG_I64_ATOMIC_LOAD:
                            pushSizeImmediate = VarUint32(8);
                            break;
                        case ARG_I32_ATOMIC_LOAD_8U:
                        case ARG_I64_ATOMIC_LOAD_8U:
                            pushSizeImmediate = VarUint32(1);
                            break;
                        case ARG_I32_ATOMIC_LOAD_16U:
                        case ARG_I64_ATOMIC_LOAD_16U:
                            pushSizeImmediate = VarUint32(2);
                            break;
                        default:
                            throw new Error("Bad atomic argument in readWatchpointInstrCallback()");
                    }
                    break;
                default:
                    throw new Error("Bad opcode in readWatchpointInstrCallback()");
            }

            // This would be cleaner using the spread operator, however it would
            // also be ludicrously slow
            const pushOffsetOpcode = [ OP_I32_CONST ];
            const pushOffsetImmediate = VarUint32(offset);

            const callOpcode = [ OP_CALL ];

            const callDest = funcEntryReadWatchpointRouter.varUint32();

            reader.copyBuffer(pushSizeOpcode);
            reader.copyBuffer(pushSizeImmediate);
            reader.copyBuffer(pushOffsetOpcode);
            reader.copyBuffer(pushOffsetImmediate);
            reader.copyBuffer(callOpcode);
            reader.copyBuffer(callDest);
            reader.copyBuffer(instrBytes);

            return reader.write();
        };

        //
        // Each store instruction is followed by a check to see if that instruction modified
        // a "watchpoint" address. The actual "watchpoint" function will not be called
        // unless the flag is nonzero. This is just a quick, preliminary check to help ensure
        // that the least extra instructions possible are executed when watchpoints are disabled.
        // The real watchpoint logic exists in the CODE entry for funcEntryWriteWatchpointRouter above.
        //
        // Injected instructions:
        //
        // // get_global <globalAreWriteWatchpointsEnabled>
        // // if
        //     call <funcEntryWriteWatchpointRouter>
        // // end 
        //
        const writeWatchpointInstrCallback = function(instrBytes) {
            const reader = new BufferReader();

            // As mentioned above, we avoid using the spread operator here solely
            // for performance reasons
            const getGlobalOpcode = [ OP_GET_GLOBAL ];
            const getGlobalImmediate = globalAreWriteWatchpointsEnabled.varUint32();

            const ifOpcode = [ OP_IF, 0x40 ];

            const callOpcode = [ OP_CALL ];
            const callDest = funcEntryWriteWatchpointRouter.varUint32();

            const endOpcode = [ OP_END ];

            reader.copyBuffer(instrBytes);
            // reader.copyBuffer(getGlobalOpcode);
            // reader.copyBuffer(getGlobalImmediate);
            // reader.copyBuffer(ifOpcode);
            reader.copyBuffer(callOpcode);
            reader.copyBuffer(callDest);
            // reader.copyBuffer(endOpcode);

            return reader.write();
        };

        // All SIMD instructions start with the same opcode (0xFD) so they need
        // their own parser
        // This parser just ensures that the instruction is actually a load/store
        // then routes the instruction to the proper callback
        const simdInstrCallback = function(instrBytes) {
            const arg = instrBytes[1];

            switch (arg) {
                case SIMD_V128_LOAD:
                case SIMD_V128_LOAD8X8_S:
                case SIMD_V128_LOAD8X8_U:
                case SIMD_V128_LOAD16X4_S:
                case SIMD_V128_LOAD16X4_U:
                case SIMD_V128_LOAD32X2_S:
                case SIMD_V128_LOAD32X2_U:
                case SIMD_V128_LOAD8_SPLAT:
                case SIMD_V128_LOAD16_SPLAT:
                case SIMD_V128_LOAD32_SPLAT:
                case SIMD_V128_LOAD64_SPLAT:
                case SIMD_V128_LOAD32_ZERO:
                case SIMD_V128_LOAD64_ZERO:
                // FIXME Handle these instructions
                //case SIMD_V128_LOAD8_LANE:
                //case SIMD_V128_LOAD16_LANE:
                //case SIMD_V128_LOAD32_LANE:
                //case SIMD_V128_LOAD64_LANE:
                    if (instrumentLevel & ENABLE_WP_READ) {
                        return readWatchpointInstrCallback(instrBytes);
                    }
                case SIMD_V128_STORE:
                case SIMD_V128_STORE8_LANE:
                case SIMD_V128_STORE16_LANE:
                case SIMD_V128_STORE32_LANE:
                case SIMD_V128_STORE64_LANE:
                    if (instrumentLevel & ENABLE_WP_WRITE) {
                        return writeWatchpointInstrCallback(instrBytes);
                    }
            }

            return instrBytes;
        };

        // All atomic instructions start with the same opcode (0xFE) so they need
        // their own parser
        // This parser just ensures that the instruction is actually an atomic load/store
        // then routes the instruction to the proper callback
        const atomicInstrCallback = function(instrBytes) {
            const arg = instrBytes[1];

            if (arg >= ARG_I32_ATOMIC_LOAD && arg <= ARG_I64_ATOMIC_LOAD_32U) {
                return readWatchpointInstrCallback(instrBytes);
            }
            else if (arg >= ARG_I32_ATOMIC_STORE && arg <= ARG_I64_ATOMIC_RMW_CMPXCHG_32U) {
                return writeWatchpointInstrCallback(instrBytes);

            }

            return instrBytes;
        };

        if (instrumentLevel & ENABLE_WP_READ) {
            wail.addInstructionParser(OP_I32_LOAD,     readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD,     readWatchpointInstrCallback);
            wail.addInstructionParser(OP_F32_LOAD,     readWatchpointInstrCallback);
            wail.addInstructionParser(OP_F64_LOAD,     readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_LOAD8_S,  readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_LOAD8_U,  readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_LOAD16_S, readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_LOAD16_U, readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD8_S,  readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD8_U,  readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD16_S, readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD16_U, readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD32_S, readWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_LOAD32_U, readWatchpointInstrCallback);
        }

        if (instrumentLevel & ENABLE_WP_WRITE) {
            wail.addInstructionParser(OP_I32_STORE,   writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_STORE,   writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_F32_STORE,   writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_F64_STORE,   writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_STORE8,  writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I32_STORE16, writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_STORE8,  writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_STORE16, writeWatchpointInstrCallback);
            wail.addInstructionParser(OP_I64_STORE32, writeWatchpointInstrCallback);
        }

        wail.addInstructionParser(OP_SIMD, simdInstrCallback);
        wail.addInstructionParser(OP_ATOMIC, atomicInstrCallback);
    }

    let memoryInstancePath;

    // We use this callback to retrieve the path to the memory object
    // If multiple memory objects are supported in the future, this will need to change
    const importEntryCallback = function(parameters) {
        if (parameters.kind == KIND_MEMORY) {
            const decoder = new TextDecoder();

            if (typeof memoryInstancePath !== "undefined") {
                colorError("Received multiple memory entries. This is unsupported by Cetus!");
            }

            memoryInstancePath = {};

            memoryInstancePath.type = "import";
            memoryInstancePath.module = decoder.decode(parameters.module);
            memoryInstancePath.field = decoder.decode(parameters.field);
        }
    }

    wail.addImportElementParser(null, importEntryCallback);

    const exportEntryCallback = function(parameters) {
        if (parameters.kind == KIND_MEMORY) {
            const decoder = new TextDecoder();

            if (typeof memoryInstancePath !== "undefined") {
                colorError("Received multiple memory entries. This is unsupported by Cetus!");
            }

            memoryInstancePath = {};

            memoryInstancePath.type = "export";
            memoryInstancePath.field = decoder.decode(parameters.field);
        }
    }

    wail.addExportElementParser(null, exportEntryCallback);

    // cetusPatches will be set early on in page load if there are any configured patches
    // for this binary
    if (typeof cetusPatches === "object") {
        for (let i = 0; i < cetusPatches.length; i++) {
            const thisPatch = cetusPatches[i];

            const funcPatches = thisPatch.functionPatches;

            for (let j = 0; j < funcPatches.length; j++) {
                const thisFuncPatch = funcPatches[i];

                const funcIndex = parseInt(thisFuncPatch.index);
                const funcBytes = thisFuncPatch.bytes;

                const parserCallback = function(parameters) {
                    return funcBytes;
                };

                wail.addCodeElementParser(funcIndex, parserCallback);
            }
        }
    }

    if (typeof cetusCallbacks === "object" && typeof cetusCallbacks.processor === "object") {
        const processorCallbacks = cetusCallbacks.processor;

        for (let i = 0; i < processorCallbacks.length; i++) {
            const processorFunc = new Function("processor", processorCallbacks[i]);

            processorFunc(wail);
        }
    }


    wail.load(bufferSource);
    wail.parse();

    const resultObj = {};
    const symObj = {};

    if (instrumentLevel) {
        for (let i = 0; i < wpCount; i++) {
            const thisFunc = wpConfigs[i].funcEntry;

            const configWpIndex = wail.getFunctionIndex(thisFunc);
            symObj[configWpIndex.i32()] = "_wp_config" + i;
        }

        if (instrumentLevel & ENABLE_WP_READ) {
            const readWpIndex =  wail.getFunctionIndex(funcEntryReadWatchpointRouter);
            symObj[readWpIndex.i32()] = "_wp_read";
        }

        if (instrumentLevel & ENABLE_WP_WRITE) {
            const writeWpIndex = wail.getFunctionIndex(funcEntryWriteWatchpointRouter);
            symObj[writeWpIndex.i32()] = "_wp_write";
        }
    }

    resultObj.buffer = wail.write();
    resultObj.symbols = symObj;
    resultObj.memory = memoryInstancePath;

    return resultObj;
};

const getMemoryFromObject = function(inObject, memoryDescriptor) {
        const memoryModule = memoryDescriptor.module;
        const memoryField = memoryDescriptor.field;

        if (typeof memoryModule === "string" && typeof memoryField === "string") {
            return inObject[memoryModule][memoryField];
        }
        else if (typeof memoryField === "string") {
            return inObject[memoryField];
        }
};

// Callback that is executed when a read watchpoint is hit
const readWatchCallback = function() {
    // window.debug(new Error().stack);
};

// Callback that is executed when a write watchpoint is hit
const writeWatchCallback = function() {
    // window.debug(new Error().stack);
};

const stacktraceCallback = function(cetusIdentifier, stackFrames) {
    const trimmedStackFrame = [];

    let watchPointsFound = 0;

    // We want to provide the user with a clean stack trace that doesn't include
    // functions that we've injected. To do that, we remove all "chrome-extension://"
    // entries and the most recent "wasm-function" (Since that is our watchpoint function)
    for (let i = 0; i < stackFrames.length; i++) {
        const thisFrame = stackFrames[i];

        let fileName = thisFrame.fileName;

        const substrIndex = fileName.indexOf("wasm-function");

        if (substrIndex === -1) {
            continue;
        }

        fileName = fileName.substring(substrIndex);

        let lineNumber = thisFrame.lineNumber;

        if (typeof lineNumber === "undefined") {
            const colonIndex = fileName.indexOf(":");

            if (colonIndex !== "-1") {
                lineNumber = parseInt(fileName.substring(colonIndex + 1));
                fileName = fileName.substring(0, colonIndex);
            }
        }

        const newFrame = {};

        newFrame.fileName = fileName;
        newFrame.lineNumber = lineNumber;

        if (watchPointsFound < 2) {
            watchPointsFound++;
            continue;
        }

        trimmedStackFrame.push(newFrame);
    }

    const msgBody = {
        stackTrace: trimmedStackFrame
    };
    console.debug(msgBody);

    cetusInstances.get(cetusIdentifier).sendExtensionMessage("watchPointHit", msgBody);
};

const oldWebAssemblyInstantiate = WebAssembly.instantiate;

const webAssemblyInstantiateHook = function(inObject, importObject = {}) {
    colorLog("WebAssembly.instantiate() intercepted");

    let memoryInstance = null;
    let memoryDescriptor;

    let instrumentedBuffer;
    let instrumentedSymbols;
    let instrumentedObject;

    // If WebAssembly.instantiate() receives a WebAssembly.Module object, we should already have
    // instrumented the binary in webAssemblyModuleProxy()
    // We should also have attached the "memory" and "symbols" objects to the module so that we
    // can reach them here.
    if (inObject instanceof WebAssembly.Module) {
        if (typeof inObject.__cetus_env === "undefined") {
            colorError("WebAssembly.instantiate() received an un-instrumented WebAssembly.Module. This is most likely a bug!");
            return oldWebAssemblyInstantiate(inObject, importObject);
        }

        memoryDescriptor    = inObject.__cetus_env.memory;
        instrumentedSymbols = inObject.__cetus_env.symbols;
        instrumentedBuffer  = inObject.__cetus_env.buffer;

        exportsInstance     = WebAssembly.Module.exports(inObject);

        instrumentedObject = inObject;
    }
    else {
        const bufferSource = inObject;

        const instrumentResults = instrumentBinary(bufferSource);

        memoryDescriptor = instrumentResults.memory;
        instrumentedBuffer = instrumentResults.buffer;
        instrumentedSymbols = instrumentResults.symbols;

        instrumentedObject = instrumentedBuffer;
    }

    if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "import") {
        memoryInstance = getMemoryFromObject(importObject, memoryDescriptor);
    }

    // Emscripten by default stores most of the environment in importObject.env
    // If it doesn't exist already let's create it so we have a place to put 
    // our imported functions
    if (typeof importObject.env !== "object") {
        importObject.env = {};
    }

    importObject.env.readWatchCallback = readWatchCallback;
    importObject.env.writeWatchCallback = writeWatchCallback;

    return new Promise(function(resolve, reject) {
        oldWebAssemblyInstantiate(instrumentedObject, importObject).then(function(instanceObject) {
            let instance = instanceObject;

            if (typeof instanceObject.instance !== "undefined") {
                instance = instanceObject.instance;
            }

            if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "export") {
                let exportObject = instance.exports;

                if (typeof exportObject !== "object") {
                    colorError("WebAssembly.instantiate() failed to retrieve export object for instantiated module");
                }

                memoryInstance = getMemoryFromObject(exportObject, memoryDescriptor);
            }

            if (!(memoryInstance instanceof WebAssembly.Memory)) {
                colorError("WebAssembly.instantiate() failed to retrieve a WebAssembly.Memory object");
            }

            const cetusIdentifier = cetusInstances.reserveIdentifier();

            const watchpointExports = [];

            for (let i = 0; i < cetusOptions.wpCount; i++) {
                watchpointExports.push(instance.exports["configWatch" + i]);
            }

            cetusInstances.newInstance(cetusIdentifier, {
                memory: memoryInstance,
                watchpointExports: watchpointExports,
                buffer: instrumentedBuffer,
                symbols: instrumentedSymbols
            });

            resolve(instanceObject);
        });
    });
};

window.WebAssembly.instantiate = webAssemblyInstantiateHook;

const webAssemblyModuleProxy = new Proxy(WebAssembly.Module, {
    construct: function(target, args) {
        colorLog("WebAssembly.Module() intercepted");

        const bufferSource = args[0];

        const instrumentResults = instrumentBinary(bufferSource);

        const instrumentedBuffer = instrumentResults.buffer;
        const instrumentedSymbols = instrumentResults.symbols;

        const result = new target(instrumentedBuffer);

        // WebAssembly.Module is typically followed up by an instantiation of
        // WebAssembly.Instance with the resulting Module object.
        // We save the instrumentation results from WAIL so that WebAssembly.Instance
        // can access them.
        result._instrumentResults = instrumentResults;

        return result;
    }
});

window.WebAssembly.Module = webAssemblyModuleProxy;

const webAssemblyInstanceProxy = new Proxy(WebAssembly.Instance, {
    construct: function(target, args) {
        colorLog("WebAssembly.Instance() intercepted");

        const module = args[0];
        const importObject = args[1] || {};

        // If this module was intercepted through an instantiation of WebAssembly.Module,
        // it should have its instrumentsResults object attached to it
        const instrumentResults = module._instrumentResults;

        let memoryInstance = null;

        if (typeof instrumentResults.memory !== "undefined") {
            const memoryModule = instrumentResults.memory.module;
            const memoryField = instrumentResults.memory.field;

            if (typeof memoryModule === "string" && typeof memoryField === "string") {
                memoryInstance = importObject[memoryModule][memoryField];
            }
        }

        // Emscripten by default stores most of the environment in importObject.env
        // If it doesn't exist already let's create it so we have a place to put 
        // our imported functions
        if (typeof importObject.env !== "object") {
            importObject.env = {};
        }

        importObject.env.readWatchCallback = readWatchCallback;
        importObject.env.writeWatchCallback = writeWatchCallback;

        const result = new target(module, importObject);

        const cetusIdentifier = cetusInstances.reserveIdentifier();

        const watchpointExports = [];

        for (let i = 0; i < cetusOptions.wpCount; i++) {
            watchpointExports.push(result.exports["configWatch" + i]);
        }

        cetusInstances.newInstance(cetusIdentifier, {
            memory: memoryInstance,
            watchpointExports: watchpointExports,
            buffer: instrumentResults.instrumentedBuffer,
            symbols: instrumentResults.instrumentedSymbols
        });

        return result;
    }
});

window.WebAssembly.Instance = webAssemblyInstanceProxy;

const oldWebAssemblyInstantiateStreaming = WebAssembly.instantiateStreaming;

const webAssemblyInstantiateStreamingHook = function(sourceObj, importObject = {}) {
    colorLog("WebAssembly.instantiateStreaming() intercepted");

    // TODO In the future we should retrieve the memory object by parsing the IMPORT/EXPORT
    // sections of the binary. But for now this is pretty reliable
    let memoryInstance = null;

    // Some older versions of emscripten use importObject.a instead of importObject.env.
    // Simply link importObject.a to importObject.env if importObject.a exists
    if (typeof importObject.a !== "undefined" && typeof importObject.env === "undefined") {
        importObject.env = importObject.a;
    }

    // Emscripten by default stores most of the environment in importObject.env
    // If it doesn't exist already let's create it so we have a place to put 
    // our imported functions
    if (typeof importObject.env === "undefined") {
        importObject.env = {};
    }

    const cetusIdentifier = cetusInstances.reserveIdentifier();

    importObject.env.readWatchCallback = function() { readWatchCallback.call(null, arguments); };
    importObject.env.writeWatchCallback = function() { writeWatchCallback.call(null, arguments); };

    const wail = new WailParser();

    return new Promise(function(resolve, reject) {
        const handleBuffer = function(bufferSource) {
            if (typeof cetusCallbacks === "object" && typeof cetusCallbacks.preinstantiate === "object") {
                const preinstantiateCallbacks = cetusCallbacks.preinstantiate;

                for (let i = 0; i < preinstantiateCallbacks.length; i++) {
                    const thisFunc = new Function("module", "importObject", preinstantiateCallbacks[i]);

                    thisFunc(bufferSource, importObject);
                }
            }

            const instrumentResults = instrumentBinary(bufferSource);

            const instrumentedBuffer = instrumentResults.buffer;
            const instrumentedSymbols = instrumentResults.symbols;

            const memoryDescriptor = instrumentResults.memory;

            if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "import") {
                memoryInstance = getMemoryFromObject(importObject, memoryDescriptor);
            }

            oldWebAssemblyInstantiate(instrumentedBuffer, importObject).then(function(instanceObject) {
                if (typeof memoryDescriptor !== "undefined" && memoryDescriptor.type === "export") {
                    memoryInstance = getMemoryFromObject(instanceObject.instance.exports, memoryDescriptor);
                }

                if (!(memoryInstance instanceof WebAssembly.Memory)) {
                    colorError("WebAssembly.instantiateStreaming() failed to retrieve a WebAssembly.Memory object");
                }

                const watchpointExports = [];

                for (let i = 0; i < cetusOptions.wpCount; i++) {
                    watchpointExports.push(instanceObject.instance.exports["configWatch" + i]);
                }

                cetusInstances.newInstance(cetusIdentifier, {
                    memory: memoryInstance,
                    watchpointExports: watchpointExports,
                    buffer: instrumentedBuffer,
                    symbols: instrumentedSymbols
                });

                resolve(instanceObject);
            });
        }

        if (sourceObj instanceof Promise) {
            sourceObj.then((res) => res.arrayBuffer()).then((bufferSource) => {
                handleBuffer(bufferSource);
            });
        }
        else if (sourceObj instanceof Response) {
            sourceObj.arrayBuffer().then((bufferSource) => {
                handleBuffer(bufferSource);
            });
        }
        else {
            colorError("Got unexpected object type as first argument to WebAssembly.instantiateStreaming");
        }
    });
};

window.WebAssembly.instantiateStreaming = webAssemblyInstantiateStreamingHook;

const oldWebAssemblyCompile = WebAssembly.compile;

const webAssemblyCompileHook = function(bufferSource) {
    colorLog("WebAssembly.compile() intercepted");

    const instrumentResults = instrumentBinary(bufferSource);
    const instrumentedBuffer = instrumentResults.buffer;

    return new Promise(function(resolve, reject) {
        oldWebAssemblyCompile(instrumentedBuffer).then(function(moduleObject) {
            // Store these values in the module object so that WebAssembly.Instantiate can access them
            moduleObject.__cetus_env = {
                buffer: instrumentedBuffer,
                memory: instrumentResults.memory,
                symbols: instrumentResults.symbols,
            };

            resolve(moduleObject);
        });
    });
}

window.WebAssembly.compile = webAssemblyCompileHook;

const oldWebAssemblyCompileStreaming = WebAssembly.compileStreaming;

const webAssemblyCompileStreamingHook = function(source) {
    colorError("WebAssembly.compileStreaming() not implemented!");

    return oldWebAssemblyCompileStreaming(source);
}

window.WebAssembly.compileStreaming = webAssemblyCompileStreamingHook;
