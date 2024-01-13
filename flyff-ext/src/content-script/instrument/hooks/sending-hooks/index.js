import handleMovementPacket from "./movement";

export default function handleMessageByCommand(cmdNumber, message) {
    const cmds = {
        1028: handleMovementPacket,
    }

    if (typeof cmds[cmdNumber] === 'undefined') {
        return;
    }

    cmds[cmdNumber](message);
}