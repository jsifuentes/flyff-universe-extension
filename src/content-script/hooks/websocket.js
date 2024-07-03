import { handleChatIndicatorPacket, handleChatPacket } from "./packets/received/chat";
import { handleMovementPacket, handlePersonLeavingOrEnterViewPacket } from "./packets/received/movement";
import { handleEquipmentChangePacket, handleEquipmentVisibilityChangePacket, handleFashionChangePacket, handleKickFromServerPacket } from "./packets/received/player";

export default class WebsocketHooks {
    websocketsCreated = [];
    lastMessage = null;
    possibleIndexes = [];

    init() {
        var self = this;
        var ws = window.WebSocket;

        const fakeConstructor = function(a, b) {
            var that = b ? new ws(a, b) : new ws(a);
            self.onWebsocketCreated(that);
            return that;
        }

        window.WebSocket = fakeConstructor;
    }

    onWebsocketCreated(ws) {
        this.websocketsCreated.push(ws);

        ws.addEventListener('close', (...args) => {
            this.websocketsCreated = this.websocketsCreated.filter((x) => x !== ws);
            wyff.logger.debug(`[ws] CLOSED`, args);
            // debugger;
        });
        
        ws.addEventListener('message', (msg) => {
            const message = new Uint8Array(msg.data);
            // first byte = magic byte (always 184)
            // byte 2-5 = length of the message (32 bit)
            // byte 6-9 = CRC-32 checksum

            const afterSkippedBytes = message.slice(9);

            const decryptedMessage = this.decryptionRoutine(afterSkippedBytes);
            const messageAscii = new TextDecoder("ascii").decode(decryptedMessage);

            // const separatorSequence = [0,0,0,1,0,0,0,1];
            // const individualCommands = [];
            // let currentCommandStartIndex = 0;
            
            // for (let i = 0; i < decryptedMessage.length; i++) {
            //     if (decryptedMessage[i] === separatorSequence[0]) {
            //         let found = true;
            //         for (let j = 1; j < separatorSequence.length; j++) {
            //             if (decryptedMessage[i+j] !== separatorSequence[j]) {
            //                 found = false;
            //                 break;
            //             }
            //         }

            //         if (found) {
            //             individualCommands.push(decryptedMessage.slice(currentCommandStartIndex, i));
            //             currentCommandStartIndex = i + separatorSequence.length;
            //         }
            //     }
            // }

            // if (individualCommands.length === 0) {
            //     individualCommands.push(decryptedMessage);
            // }

            wyff.logger.debug(`[ws] RECEIVED\n%c${decryptedMessage.join("\t")}%c\n%c${messageAscii}`, 'background: #c4e2ff; color: black;', '', 'background: #c4d0ff; color: black;', {
                decryptedMessage: decryptedMessage,
                encryptedMessage: message,
                // individualCommands: individualCommands,
            });

            // const separatorSequenceTabbed = separatorSequence.join("\t");
            // let decryptedMessagesExtraColors = [];
            // let decryptedAllCommandsInt8 = [];
            // let decryptedAllCommandsAscii = [];
            // let individualCommandHeaders = [];

            // for (let i = 0; i < individualCommands.length; i++) {
            //     const decryptedCommandInt8 = individualCommands[i];
            //     const decryptedCommandAscii = new TextDecoder("ascii").decode(decryptedCommandInt8);

            //     const view = new DataView(decryptedCommandInt8.buffer);
            //     const cmdPacket = view.getUint32(0, true);
            //     individualCommandHeaders.push(cmdPacket);

            //     decryptedAllCommandsInt8.push(decryptedCommandInt8.join("\t"));
            //     decryptedAllCommandsAscii.push(decryptedCommandAscii);

            //     if (i > 0) {
            //         decryptedMessagesExtraColors.push('background: #ffcccb; color: black;');
            //         decryptedMessagesExtraColors.push('background: #c4e2ff; color: black;');
            //     }
            // }

            // wyff.logger.debug(`[ws] RECEIVED\n%c${decryptedAllCommandsInt8.join("%c" + separatorSequenceTabbed + "%c")}%c\n%c${decryptedAllCommandsAscii.join("\n")}`, 'background: #c4e2ff; color: black;', ...decryptedMessagesExtraColors, '', 'background: #c4d0ff; color: black;', {
            //     buffer: decryptedMessage,
            //     encryptedMessage: message,
            //     // individualCommands: individualCommands,
            //     // individualCommandHeaders: individualCommandHeaders.map(x => `0x${x.toString(16)}`),
            // });

            this._handleReceivedPacket(decryptedMessage);
            // for (let i = 0; i < individualCommands.length; i++) {
            //     this._handleReceivedPacket(individualCommands[i]);
            // }

            this.lastMessage = message;
        });

        const originalSend = ws.send;
        ws.send = (data) => {
            const message = new Uint8Array(data);
            // first byte = magic byte (always 31)
            // byte 2-5 = length of the message (32 bit)
            // byte 6-9 = CRC-32 checksum
            const afterSkippedBytes = message.slice(9);

            const decryptedMessage = this.encryptionRoutine(afterSkippedBytes);
            const messageAscii = new TextDecoder("ascii").decode(decryptedMessage);

            wyff.logger.debug(`[ws] SENDING\n%c${decryptedMessage.join("\t")}%c\n%c${messageAscii}`, 'background: #c4ffcd; color: black;', '', 'background: #a7facd; color: black;', {
                decryptedMessage: decryptedMessage,
                originalMessage: message,
            });

            originalSend.call(ws, message);
        };

        // Patch every single function on the WebSocket object so we can intercept all function calls
        for (let key in ws) {
            if (typeof ws[key] === 'function') {
                ws[key] = new Proxy(ws[key], {
                    apply: (target, thisArg, argumentsList) => {
                        if (key === 'close') {
                            // debugger;
                        }
                        wyff.logger.debug(`[ws] CALLING ${key}`, argumentsList);
                        return target.apply(thisArg, argumentsList);
                    }
                });
            }
        }
    }

    encryptionRoutine(message) {
        const result = new Uint8Array(message.length);
        for (var i = 0; i < message.length; i++) {
            let xorKeyIndex = (i+1) & (wyff.encryptionXorKey.length-1);
            result[i] = message[i] ^ wyff.encryptionXorKey[xorKeyIndex];
        }
        return result;
    }

    decryptionRoutine(message) {
        const result = new Uint8Array(message.length);
        for (var i = 0; i < message.length; i++) {
            let xorKeyIndex = (i+1) & (wyff.decryptionXorKey.length-1);
            result[i] = message[i] ^ wyff.decryptionXorKey[xorKeyIndex];
        }
        return result;
    }

    async _handleReceivedPacket(msg) {
        const view = new DataView(msg.buffer);
        const cmdPacket = view.getUint32(0, true);

        const packetDictionary = {
            /* none of this is right anymore. */

            // // 0x646a8400: handleClientInitialInfoPacket,
            // 0x641ab004: handleMovementPacket,
            // 0x646ab44e: handleChatIndicatorPacket,
            // 0x646ab400: handleChatPacket,
            // // 0x646a843d: handlePersonLoggingInIntoView,
            // 0x646a8402: handlePersonLeavingOrEnterViewPacket,
            // 0x646a842a: handleFashionChangePacket,
            // 0x646a8427: handleEquipmentChangePacket,
            // 0x646a8418: handleEquipmentVisibilityChangePacket,
        }

        if (packetDictionary[cmdPacket]) {
            packetDictionary[cmdPacket](msg);
        }
    }

    getActiveWebsocket() {
        return this.websocketsCreated.find((ws) => ws.readyState === 1);
    }
}