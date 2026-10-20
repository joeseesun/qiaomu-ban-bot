import {build} from 'esbuild';
import {compile} from 'sass';
import {cp,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function buildWriter(root,output){
  const result=await build({entryPoints:{write:path.join(root,'src/writer/core/write.ts'),settings:path.join(root,'src/writer/settings.ts')},bundle:true,format:'esm',splitting:true,outdir:path.join(output,'writer'),chunkNames:'chunks/[name]-[hash]',target:'chrome120',minify:true,metafile:true,legalComments:'eof',define:{DEBUG_MODE:'false',PACKAGE_VERSION:JSON.stringify('3.2.1')}});
  await Promise.all([['x-publish-main','main-world.js'],['x-publish-content','x-content.ts']].map(([name,file])=>build({entryPoints:[path.join(root,'src/writer/x-publish',file)],bundle:true,format:'iife',outfile:path.join(output,name+'.js'),target:'chrome120',minify:true,legalComments:'eof'})));
  for(const[name,file]of[['writer-base','base'],['writer-settings','writer-settings'],['write','write']])await writeFile(path.join(output,name+'.css'),compile(path.join(root,`src/writer/styles/${file}.scss`),{style:'compressed',logger:{warn(){},debug(){}}}).css);
  await cp(path.join(root,'node_modules/katex/dist/katex.min.css'),path.join(output,'katex.css'));
  await cp(path.join(root,'node_modules/katex/dist/fonts'),path.join(output,'fonts'),{recursive:true});
  await cp(path.join(root,'src/writer/LICENSE.clipper'),path.join(output,'LICENSE.clipper'));
  const packages=new Set();
  for(const file of Object.keys(result.metafile.inputs)){
    const parts=file.split('/'),index=parts.lastIndexOf('node_modules');
    if(index>=0)packages.add(parts.slice(0,index+(parts[index+1].startsWith('@')?3:2)).join('/'));
  }
  let notices=await readFile(path.join(root,'THIRD_PARTY_NOTICES.md'),'utf8');
  for(const directory of [...packages].sort()){
    const dir=path.resolve(root,directory),pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
    notices+=`\n\n## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license||'see package notice'}\n`;
    for(const file of (await readdir(dir)).filter(f=>/^(licen[cs]e|copying|notice)([.-].*)?$/i.test(f)).sort()){
      notices+=`\n${file}\n\n${await readFile(path.join(dir,file),'utf8')}\n`;
    }
  }
  await writeFile(path.join(output,'THIRD_PARTY_NOTICES.md'),notices);
}
