export function handleFashionChangePacket(msg) {
    wyff.logger.info(`[received fashion change] %c${msg.join("\t")}`, 'background: orange; color: black;', {
        buffer: msg
    });
}

export function handleEquipmentChangePacket(msg) {
    wyff.logger.info(`[received equipment change] %c${msg.join("\t")}`, 'background: chocolate; color: black;', {
        buffer: msg
    });
}

export function handleEquipmentVisibilityChangePacket(msg) {
    wyff.logger.info(`[received equipment visibility change] %c${msg.join("\t")}`, 'background: coral; color: black;', {
        buffer: msg
    });
}

export function handleKickFromServerPacket(msg) {
    wyff.logger.info(`[received kick from server???] %c${msg.join("\t")}`, 'background: lightred; color: black;', {
        buffer: msg
    });
}