const cache=new Map();
let manifestPromise;
async function manifest() {
  manifestPromise ??= fetch(`/data/publication.json?check=${Date.now()}`,{cache:'no-cache'}).then(async response=>{
    if(!response.ok) throw new Error('Published manifest is unavailable');
    return response.json();
  }).catch(error=>{manifestPromise=undefined;throw error;});
  return manifestPromise;
}
export async function loadPublishedFile(name) {
  if(!cache.has(name)) cache.set(name,(async()=>{
    const release=await manifest(),hash=release.files?.[name];
    if(!hash) throw new Error(`Published file not listed: ${name}`);
    let lastError;
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await fetch(`/data/${name}?v=${hash}&attempt=${attempt}`,{cache:'no-cache'});
        if(!response.ok) throw new Error(`Published data unavailable: ${name}`);
        const bytes=await response.arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
        if(digest!==hash) throw new Error('Publication is still deploying. Reload shortly.');
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch(error) {lastError=error;if(attempt<2) await new Promise(resolve=>setTimeout(resolve,1000));}
    }
    throw lastError;
  })().catch(error=>{cache.delete(name);throw error;}));
  return cache.get(name);
}
