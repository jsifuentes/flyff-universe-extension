export function handleMovementPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacketLength = 4;
    const unknownBytes = 13;
    const movementOperationOffset = cmdPacketLength + unknownBytes;
    const startOfMovementOperationArguments = cmdPacketLength + 18;
    let endOfMovementOperationArguments;

    const movementOperation = view.getUint8(movementOperationOffset, true);

    if (movementOperation === 1) {
        // we are moving in a direction using movement keys
        const angleOffset = startOfMovementOperationArguments;
        const angle = view.getFloat32(angleOffset, true);
        endOfMovementOperationArguments = angleOffset + 8;

        wyff.logger.info(`[received movement] moving using movement keys: angle: ${angle}`);
    } else if (movementOperation === 7) {
        // we are moving to a specific location using the mouse
        const x = view.getFloat32(startOfMovementOperationArguments, true);
        const y = view.getFloat32(startOfMovementOperationArguments + 8, true);
        const z = view.getFloat32(startOfMovementOperationArguments + 16, true);
        endOfMovementOperationArguments = startOfMovementOperationArguments + 24;

        wyff.logger.info(`[received movement] moving using the mouse: x: ${x}, y: ${y}, z: ${z}`);
    }

    const startOfUnknownHeader = cmdPacketLength;

    const whoDidIt = view.getBigUint64(endOfMovementOperationArguments, true);

    wyff.logger.info(
        `[received movement] %c${msg.slice(startOfUnknownHeader, startOfMovementOperationArguments - 4)},` +
        `%c${msg.slice(startOfMovementOperationArguments - 4, startOfMovementOperationArguments)},` +
        `%c${msg.slice(startOfMovementOperationArguments, endOfMovementOperationArguments)},` +
        `%c${msg.slice(endOfMovementOperationArguments)}` +
        `%c - who did it: ${whoDidIt}`,

        'background: orange; color: black;',
        'background: red; color: black;',
        'background: cyan; color: black;',
        'background: yellow; color: black;',
        '',
    );
}

export function handlePersonLeavingOrEnterViewPacket(msg) {
    const view = new DataView(msg.buffer);
    const cmdPacketLength = 4;
    
}
