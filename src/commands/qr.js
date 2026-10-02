import {generateQR} from '../qr/index.js';import config from '../config/config.js';
export default {name:'qr',category:'Image',description:'Generate a PNG QR code',usage:'qr <text or URL>',minArgs:1,async run(ctx){
 const text=ctx.text.slice(config.prefix.length).trim().replace(/^\S+\s*/, '');
 try{const image=await generateQR(text);await ctx.sock.sendMessage(ctx.jid,{image,mimetype:'image/png',caption:'QR code'},{quoted:ctx.msg});}catch(e){await ctx.reply(e.message);}
}};
