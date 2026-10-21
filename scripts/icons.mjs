import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
function crc32(bytes) { let c=0xffffffff; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0; }
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}

// Artwork lives on a 96-unit square: a white 木 on a black tile. The right-falling stroke runs
// as a thick diagonal beside a thin parallel one, borrowing X's double-stroke rhythm without drawing an X.
// Traced from the chosen Codex concept (design-previews/icon-2026-10-21) and tidied; public/brand.svg holds the same paths.
const BLACK=[0,0,0],WHITE=[255,255,255];
const roundRect=(x,y,w,h,r)=>(px,py)=>{const dx=Math.max(Math.abs(px-(x+w/2))-(w/2-r),0),dy=Math.max(Math.abs(py-(y+h/2))-(h/2-r),0);return dx*dx+dy*dy<=r*r&&px>=x&&px<=x+w&&py>=y&&py<=y+h;};
const GLYPH=[[[42.6,15.5],[53.16,15.5],[53.16,30.66],[42.6,30.66]],[[17.05,30.66],[78.87,30.66],[74.9,39.55],[20.94,39.55]],[[42.6,39.55],[53.16,39.55],[53.16,46.69],[83.0,79.71],[70.38,79.71],[42.6,43.6]],[[29.9,43.12],[39.11,43.12],[53.16,61.37],[53.16,79.87],[42.6,79.87],[42.6,59.63]],[[33.63,52.33],[40.22,60.66],[20.22,80.5],[13.0,73.28]]];
const inPolygon=(poly,px,py)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
const glyph=(px,py)=>GLYPH.some(poly=>inPolygon(poly,px,py));
const tile=roundRect(0,0,96,96,22);
// Chrome Web Store: 96px artwork plus 16px transparent padding at 128. Toolbar sizes fill the canvas to stay legible.
const PADDING={16:0,32:0,48:6,128:16};
export async function icons(output){
  await mkdir(path.join(output,'icons'),{recursive:true});
  const SS=6;
  for(const size of [16,32,48,128]){
    const pad=PADDING[size],art=size-pad*2,glow=pad>0;
    const rows=Buffer.alloc(size*(size*4+1));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      let r=0,g=0,b=0,a=0;
      for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){
        const px=(x+(sx+.5)/SS-pad)*96/art,py=(y+(sy+.5)/SS-pad)*96/art;
        let color=null,alpha=1;
        if(tile(px,py))color=glyph(px,py)?WHITE:BLACK;
        else if(glow&&roundRect(-1.5,-1.5,99,99,23.5)(px,py)){color=WHITE;alpha=.2;} // faint edge for dark toolbars
        if(color){r+=color[0]*alpha;g+=color[1]*alpha;b+=color[2]*alpha;a+=alpha;}
      }
      const o=y*(size*4+1)+1+x*4;
      if(a){rows[o]=Math.round(r/a);rows[o+1]=Math.round(g/a);rows[o+2]=Math.round(b/a);}
      rows[o+3]=Math.round(a/(SS*SS)*255);
    }
    const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
    await writeFile(path.join(output,`icons/icon-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
  }
}
