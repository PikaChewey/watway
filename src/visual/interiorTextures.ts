import * as THREE from 'three';

/** Small deterministic, tileable textures: no downloads or extra geometry. */
export function createInteriorTextures() {
  const make = (paint:(c:CanvasRenderingContext2D)=>void) => {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    paint(canvas.getContext('2d')!);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=4;
    return texture;
  };
  const grain=(c:CanvasRenderingContext2D,count:number,alpha=.08)=>{
    for(let i=0;i<count;i++){c.fillStyle=i%2?`rgba(255,255,255,${alpha})`:`rgba(42,35,24,${alpha})`;c.fillRect((i*137)%512,(i*71+Math.floor(i/512)*31)%512,1+i%3,1+i%2);}
  };
  const wall=make(c=>{
    c.fillStyle='#d3c6ac';c.fillRect(0,0,512,512);
    // Painted masonry joints above a durable green lower wall.
    c.strokeStyle='#baae98';c.lineWidth=2;
    for(let y=0;y<512;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=(y/64)%2?0:128;x<512;x+=256){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}
    c.fillStyle='#6a8178';c.fillRect(0,340,512,160);
    c.fillStyle='#bbaa7e';c.fillRect(0,333,512,9);
    c.fillStyle='#53685e';c.fillRect(0,343,512,3);
    c.fillStyle='#3b4943';c.fillRect(0,490,512,22);
    grain(c,15000,.045);
  });
  const floor=make(c=>{
    c.fillStyle='#9d9c8a';c.fillRect(0,0,512,512);
    for(let y=0;y<512;y+=128)for(let x=0;x<512;x+=128){c.fillStyle=((x+y)/128)%2?'#b9b5a2':'#c5c0ad';c.fillRect(x+2,y+2,124,124);}
    grain(c,26000,.12);
  });
  const ceiling=make(c=>{
    c.fillStyle='#b7bbb1';c.fillRect(0,0,512,512);
    c.fillStyle='#d4d5c8';for(let y=0;y<512;y+=256)for(let x=0;x<512;x+=256)c.fillRect(x+3,y+3,250,250);
    grain(c,19000,.055);
  });
  const stair=make(c=>{
    c.fillStyle='#c4c2b5';c.fillRect(0,0,512,512);
    grain(c,28000,.11);
  });
  const door=make(c=>{
    c.fillStyle='#866440';c.fillRect(0,0,512,512);
    for(let x=0;x<512;x+=3){c.strokeStyle=x%9?'#71533755':'#b9956255';c.lineWidth=1;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+4,150,x-3,350,x+2,512);c.stroke();}
  });
  return {wall,floor,ceiling,door,stair};
}
