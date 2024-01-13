export default function handleMovementPacket(message) {
    wyff.logger.info(`got movement packet: ${JSON.stringify(message)}`);
    // const view = new DataView(message.buffer);
    // // skip first four bytes
    // const offset = 4;
    // const unknownBytes = 16 + 2; // 2 for 2 null bytes
    // // const unknownStuff = view.getUint32(16 + offset, true);
    // const x = view.getFloat32(unknownBytes + offset, true);
    // const y = view.getFloat32(unknownBytes + offset + 4 + 4 /** null bytes */, true);
    // // const z = view.getFloat32(unknownBytes + offset + 4 + 4 /** null bytes */ + 4 + 4 /** null bytes */, true);
    // // const angle = view.getFloat32(unknownBytes + offset + 4 + 4 /** null bytes */ + 4 + 4 /** null bytes */ + 4 + 4 /** null bytes */, true);
    
}