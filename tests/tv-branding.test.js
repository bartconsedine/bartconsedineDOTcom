import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
test('Bart TV manifest has installable PNG icons with matching dimensions and safe Home scope',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/tv/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'Bart TV');assert.equal(manifest.short_name,'Bart TV');assert.equal(manifest.start_url,'/tv?view=home');assert.equal(manifest.scope,'/tv');
 for(const icon of manifest.icons){const meta=await sharp(new URL(`../public${icon.src}`,import.meta.url).pathname).metadata();assert.equal(`${meta.width}x${meta.height}`,icon.sizes);assert.equal(meta.format,'png');}
 const banner=await sharp(new URL('../public/tv/banner-1280x720.png',import.meta.url).pathname).metadata();assert.equal(banner.width,1280);assert.equal(banner.height,720);
});
