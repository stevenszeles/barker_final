// Static transport only. Presentation and portfolio calculations stay in the original dashboard.
import { api } from './api';
if (import.meta.env.VITE_STATIC_MODE === '1') {
  const nativeFetch = window.fetch.bind(window);
  const workspace = nativeFetch('/data/workspace.json', { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error('Published workspace is unavailable');
    return r.json();
  });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin === location.origin && url.pathname === '/api/admin/shared-dashboard-state') {
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
        return new Response(JSON.stringify({ detail:'Published snapshot is read-only. Publish a new snapshot to share updates.' }), {status:409,headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify(await workspace), {headers:{'Content-Type':'application/json'}});
    }
    if (url.origin === location.origin && url.pathname === '/health') return new Response('{}', {headers:{'Content-Type':'application/json'}});
    return nativeFetch(input, init);
  };
  api.defaults.adapter = async config => {
    if ((config.method ?? 'get').toLowerCase() !== 'get') throw new Error('Published portfolio is read-only');
    const url = new URL(config.url ?? '', location.origin);
    for (const [key,value] of Object.entries(config.params ?? {})) url.searchParams.set(key,String(value));
    const account = url.searchParams.get('account') || 'ALL';
    const response = await nativeFetch('/data/portfolio.json', {cache:'no-cache'});
    if (!response.ok) throw new Error('Published analysis is unavailable');
    const snapshot = await response.json();
    const key = url.pathname === '/portfolio/nav' ? `${url.pathname}?account=${account}` : url.pathname;
    if (!(key in snapshot.responses)) throw new Error(`Analysis unavailable in published snapshot: ${url.pathname}`);
    const data = snapshot.responses[key];
    const limit = Number(url.searchParams.get('limit'));
    return {data:Array.isArray(data) && limit > 0 ? data.slice(-limit) : data,status:200,statusText:'OK',headers:{},config};
  };
}
