export function handleChatPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacket = view.getUint32(0, true);
    const chatMessageLength = view.getUint32(4, true);
    const message = new TextDecoder("ascii").decode(msg.slice(8, 8 + chatMessageLength));
    const afterMessageUnknownBytes = 5;
    const whoDidIt = view.getBigUint64(8 + chatMessageLength + afterMessageUnknownBytes, true);
    // rest is unknown
    wyff.logger.info(`[received chat] message: "${message}", who did it: ${whoDidIt}`);
}

export function handleChatIndicatorPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacket = view.getUint32(0, true);
    const chatIndicator = view.getUint8(4, true);
    const whoDidIt = view.getBigUint64(5, true);
    // rest is unknown
    wyff.logger.info(`[received chat indicator] chat indicator: "${chatIndicator ? 'chatting' : 'NOT chatting'}", who did it: ${whoDidIt}`);
}