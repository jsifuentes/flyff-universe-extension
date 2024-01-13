export default function toHex(i) {
	return '0x' + parseInt(i).toString(16).padStart(8, '0');
};