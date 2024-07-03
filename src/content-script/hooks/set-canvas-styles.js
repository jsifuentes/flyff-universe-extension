export default function setCanvasStyles() {
    const canvas = document.getElementById('canvas');
    canvas.style.margin = "0 auto";

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = "80"
    tempCanvas.height = "100";
    var ctx = tempCanvas.getContext('2d');

    ctx.font = "bold 20pt 'Courier New', monospace";
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.letterSpacing = "3px";

    ctx.save();
    ctx.translate(20,80);
    ctx.rotate(-0.2*Math.PI);

    var rText = 'WYFF';
    ctx.fillText(rText , 0, 0);
    ctx.restore();


    const d = document.createElement('div');
    d.style.backgroundImage = "url(" + tempCanvas.toDataURL("image/png")+ ")";
    d.style.backgroundColor = "black";
    d.style.height = "100%";
    d.style.width = "100%";
    d.style.position = "fixed";
    d.style.zIndex = "-1";
    document.body.appendChild(d);
}