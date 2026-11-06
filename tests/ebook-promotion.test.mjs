import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile:false, server:{ middlewareMode:true, watch:null, hmr:false }, appType:'custom' });
after(() => server.close());
const { isEbookPromotionDue, readEbookGenerationCount, saveEbookGenerationCount, preloadEbookCover } = await server.ssrLoadModule('/services/ebookPromotion.ts');

test('preloading requests WebP once and falls back to the original PNG on failure', () => {
  let image;
  let requests = 0;
  globalThis.Image = class { constructor() { image=this; requests++; } };
  try {
    preloadEbookCover();
    assert.equal(image.src,'/promotions/make-her-think-about-you-cover.webp');
    image.onerror();
    assert.equal(image.src,'/promotions/make-her-think-about-you-cover.png');
    assert.equal(image.onerror,null);
    preloadEbookCover();
    assert.equal(requests,1);
  } finally { delete globalThis.Image; }
});

test('offers appear after two successful generations and five more thereafter', () => {
  assert.deepEqual(Array.from({length:23}, (_,n)=>n).filter(isEbookPromotionDue), [2,7,12,17,22]);
});

test('tab count survives remounts, rejects corrupt storage, and tolerates blocked storage', () => {
  let value = null;
  globalThis.sessionStorage = { getItem:()=>value, setItem:(_key,next)=>{value=next;} };
  try {
    assert.equal(readEbookGenerationCount(),0);
    saveEbookGenerationCount(6);
    assert.equal(readEbookGenerationCount(),6);
    for (const invalid of ['NaN','-3','2.5','Infinity']) {
      value=invalid;
      assert.equal(readEbookGenerationCount(),0);
    }
    globalThis.sessionStorage = { getItem:()=>{throw new Error('blocked');}, setItem:()=>{throw new Error('blocked');} };
    assert.equal(readEbookGenerationCount(),0);
    assert.doesNotThrow(()=>saveEbookGenerationCount(7));
  } finally { delete globalThis.sessionStorage; }
});
