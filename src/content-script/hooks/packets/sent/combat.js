export default function handleCombatPacket(message) {
    // 68 + 71 dmg
    const view = new DataView(message.buffer);
    const dmg = view.getInt32(70, true)
    wyff.logger.debug(`GOT HIT FOR ${dmg}`)
}