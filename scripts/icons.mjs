import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
function crc32(bytes) { let c=0xffffffff; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0; }
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
export async function icons(output){
  await mkdir(path.join(output,'icons'),{recursive:true});
  for(const size of [16,32,48,128]){
    const rows=Buffer.alloc(size*(size*4+1));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      let r=0,a=0;
      for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
        const px=(x+(sx+.5)/4)*128/size,py=(y+(sy+.5)/4)*128/size;
        const round=(x,y,w,h,r)=>{
          const dx=Math.max(Math.abs(px-(x+w/2))-(w/2-r),0),dy=Math.max(Math.abs(py-(y+h/2))-(h/2-r),0);
          return dx*dx+dy*dy<=r*r && px>=x && px<=x+w && py>=y && py<=y+h;
        };
        if(!round(4,4,120,120,28))continue;
        a+=255;
        const tail=px>=38&&px<=61&&py>=84&&py<=105-(px-38)*21/23;
        const bubble=round(24,24,80,68,18)||tail;
        const filter=round(40,42,48,8,4)||round(48,56,32,8,4)||round(56,70,16,8,4);
        r+=bubble&&!filter?255:23;
      }
      const offset=y*(size*4+1)+1+x*4;rows[offset]=rows[offset+1]=rows[offset+2]=a?Math.round(r*255/a):0;rows[offset+3]=Math.round(a/16);
    }
    const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
    await writeFile(path.join(output,`icons/icon-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
  }
}
