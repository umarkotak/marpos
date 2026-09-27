import { useSyncExternalStore } from "react";
export const pagePaths={pos:"/pos",products:"/products",orders:"/orders",finance:"/finance",reports:"/reports",audit:"/audit-log",team:"/team",settings:"/settings",stores:"/stores"};
const subscribe=(notify)=>{window.addEventListener("popstate",notify);return()=>window.removeEventListener("popstate",notify);};
// All routes use one app shell so navigation also works offline.
export function navigate(path,replace=false){window.history[replace?"replaceState":"pushState"]({},"",path);window.dispatchEvent(new PopStateEvent("popstate"));}
export function useLocation(){const href=useSyncExternalStore(subscribe,()=>window.location.pathname+window.location.search,()=>"/");const url=new URL(href,"http://local");return {pathname:url.pathname,query:url.searchParams};}
export function updateQuery(values,replace=true,path=window.location.pathname){const query=new URLSearchParams(window.location.search);for(const [key,value] of Object.entries(values)){if(value===null||value===undefined)query.delete(key);else query.set(key,String(value));}navigate(path+(query.size?`?${query}`:""),replace);}
export function useQueryState(key,fallback=""){const {query}=useLocation();return [query.get(key)??fallback,(value)=>updateQuery({[key]:value})];}
