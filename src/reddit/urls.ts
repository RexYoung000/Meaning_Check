export function redditRef(value:string):{id:string;url:string;postId:string;rootUrl:string}|undefined {
  try {const u=new URL(value,'https://www.reddit.com');if(u.protocol!=='https:'||!['www.reddit.com','reddit.com'].includes(u.hostname))return;
    const match=/^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/([^/]*))?(?:\/([a-z0-9]+))?\/?$/i.exec(u.pathname);if(!match?.[1])return;
    const clean=u.pathname.replace(/\/+$/,'');
    const rootUrl=u.origin+(match[3]?clean.slice(0,clean.lastIndexOf('/')):clean)+'/';
    return {id:(match[3]?'t1_'+match[3]:'t3_'+match[1]).toLowerCase(),url:u.origin+u.pathname.replace(/\/+$/,'')+'/',postId:'t3_'+match[1].toLowerCase(),rootUrl};
  }catch{return;}
}
