export function uint64ToUint8Array(int64) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, BigInt(int64), true);
    const uint8Array = [];
    for(let i = 0; i < 8; i++){
        uint8Array.push(view.getUint8(i));
    }
    return uint8Array;
  }