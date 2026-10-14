import {postRef} from '../x/urls';
import {redditRef} from '../reddit/urls';
export function threadRef(url:string):{id:string;url:string}|undefined {return postRef(url)??redditRef(url);}
