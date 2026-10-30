// Static transport only. Presentation and portfolio calculations stay in the original dashboard.
import { loadPublishedFile } from './publication';
import { api } from './api';
if (import.meta.env.VITE_STATIC_MODE === '1') {
  const nativeFetch = window.fetch.bind(window);
  const workspace=loadPublishedFile('workspace.json');
  let preview: unknown = null;
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin === location.origin && url.pathname === '/api/admin/shared-dashboard-state') {
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
        const original=await workspace;
        const body=JSON.parse(String(init?.body || '{}'));
        preview={...original,state:body.state,version:(body.base_version || original.version)+1,preview:true};
        return new Response(JSON.stringify(preview), {headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify(preview || await workspace), {headers:{'Content-Type':'application/json'}});
    }
    if (url.origin === location.origin && url.pathname === '/health') return new Response('{}', {headers:{'Content-Type':'application/json'}});
    return nativeFetch(input, init);
  };
  api.defaults.adapter = async config => {
    if ((config.method ?? 'get').toLowerCase() !== 'get') throw new Error('Published portfolio is read-only');
    const url = new URL(config.url ?? '', location.origin);
    for (const [key,value] of Object.entries(config.params ?? {})) url.searchParams.set(key,String(value));
    const account = url.searchParams.get('account') || 'ALL';
    const snapshot=await loadPublishedFile('nav-history.json');
    const key = url.pathname === '/portfolio/nav' ? `${url.pathname}?account=${account}` : url.pathname;
    if (!(key in snapshot.responses)) throw new Error(`Analysis unavailable in published snapshot: ${url.pathname}`);
    const data = snapshot.responses[key];
    const limit = Number(url.searchParams.get('limit'));
    return {data:Array.isArray(data) && limit > 0 ? data.slice(-limit) : data,status:200,statusText:'OK',headers:{},config};
  };
}
