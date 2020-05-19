const LOADING = {};
export function cssP(url){
  if( LOADING[url] ){
    return LOADING[url];
  }
  
  // if( url.match(/^\./) ){
  //   throw new Error(`Importing relative url ${url}\nYou are likely to be eaten by a grue`);
  // }
  
  return LOADING[url] = new Promise(function(resolve,reject){
    let link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.type = 'text/css';
    link.setAttribute('href', url);
    
    link.onload = ()=>{
      resolve(link);
    }
    link.onerror = err => {
      console.error(`importP loading ${url} FAILED`);
      reject(err);
    }
    document.head.appendChild(link);
  });
}
