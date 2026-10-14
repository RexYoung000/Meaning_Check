import {startReader} from '../../ui/reader';
export default defineContentScript({matches:['https://x.com/*','https://www.reddit.com/*','https://reddit.com/*'],runAt:'document_idle',main(ctx){startReader(ctx);}});
