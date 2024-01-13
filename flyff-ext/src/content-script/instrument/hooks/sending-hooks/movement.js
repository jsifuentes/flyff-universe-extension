export default function handleMovementPacket(message) {
    const view = new DataView(message.buffer);

    const cmdPacketLength = 4;
    const unknownBytes = 13;
    const movementOperationOffset = cmdPacketLength + unknownBytes;

    const movementOperation = view.getUint8(movementOperationOffset);

    wyff.logger.info(`movement operation: ${movementOperation}`);

    const startOfMovementOperationArguments = cmdPacketLength + 18;
    if (movementOperation === 1) {
        // we are moving in a direction using movement keys
        const angleOffset = startOfMovementOperationArguments;
        const angle = view.getFloat32(angleOffset, true);

        wyff.logger.info(`moving using movement keys: angle: ${angle}`);
    } else if (movementOperation === 7) {
        // we are moving to a specific location using the mouse
        const x = view.getFloat32(startOfMovementOperationArguments, true);
        const y = view.getFloat32(startOfMovementOperationArguments + 8, true);
        const z = view.getFloat32(startOfMovementOperationArguments + 16, true);

        wyff.logger.info(`moving using the mouse: x: ${x}, y: ${y}, z: ${z}`);
    }

    wyff.logger.info(

        `%c${message.slice(4, startOfMovementOperationArguments)}` +
        `%c${message.slice(startOfMovementOperationArguments + 1)}`,

        'background: orange; color: black;',
        'background: yellow; color: black;',

    );

}