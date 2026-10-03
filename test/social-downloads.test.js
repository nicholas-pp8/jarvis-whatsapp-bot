import test from 'node:test';import assert from 'node:assert/strict';
import {socialPlatform,canonicalSocial,makeSocial} from '../src/downloaders/social.js';
import {detectPlatform} from '../src/downloaders/index.js';
test('social domain and URL validation is strict',()=>{
 for(const [name,url]of [['instagram','https://www.instagram.com/reel/ABC_123/'],['facebook','https://www.facebook.com/reel/123/'],['facebook','https://fb.watch/ABC/'],['twitter','https://x.com/person/status/123']]){const u=new URL(url);assert.equal(socialPlatform(u),name);assert.ok(canonicalSocial(u,name));assert.equal(detectPlatform(url).downloader.name,name);}
 for(const u of ['http://instagram.com/reel/x/','https://instagram.com.evil.test/reel/x/','https://u:p@instagram.com/reel/x/','https://instagram.com:99/reel/x/','https://127.0.0.1/reel/x/'])assert.equal(socialPlatform(new URL(u)),null);
 for(const [n,u]of [['instagram','https://instagram.com/person/'],['instagram','https://instagram.com/stories/person/123'],['twitter','https://x.com/person'],['facebook','https://facebook.com/groups/123']])assert.equal(canonicalSocial(new URL(u),n),null);
 assert.equal(canonicalSocial(new URL('https://x.com/person/status/123?token=foo#x'),'twitter'),'https://x.com/person/status/123');
});
test('all social command aliases load and require public link',async()=>{for(const n of ['instagram','facebook','twitter']){const c=(await import('../src/commands/'+n+'.js')).default;assert.equal(c.name,n);assert.equal(c.minArgs,1);assert.ok(c.aliases.length);await assert.rejects(makeSocial(n).download(new URL('https://example.com/foo'),{kind:'video',dir:'/tmp'}));}});
test('social requests are rate limited separately',async()=>{const {limitSocial}=await import('../src/commands/_download.js');limitSocial('socialtest',1000);limitSocial('socialtest',1001);limitSocial('socialtest',1002);assert.throws(()=>limitSocial('socialtest',1003));limitSocial('socialtest',62000);});
