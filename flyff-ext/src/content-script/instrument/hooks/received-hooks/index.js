import handleCombatPacket from "./combat";

export default function handleMessageByCommand(cmdNumber, message) {
    const cmds = {
        260372: handleCombatPacket(message)
    }

    if (typeof cmds[cmdNumber] === 'undefined') {
        return;
    }

    cmds[cmdNumber](message);
}
