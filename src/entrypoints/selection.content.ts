import {startReader} from '../ui/reader';
export default defineContentScript({matches:[],registration:'runtime',runAt:'document_idle',main(ctx){startReader(ctx,true);}});
