import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
const source=await readFile('public/icon.svg','utf8');
const browser=await chromium.launch({headless:true,...(process.env.MEANING_CHECK_CHROMIUM?{executablePath:process.env.MEANING_CHECK_CHROMIUM}:{})});
try {await mkdir('public/icons',{recursive:true});for(const size of [16,32,48,128]){const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});await page.setContent('<style>html,body{margin:0}svg{width:100vw;height:100vh;display:block}</style>'+source);await page.screenshot({path:'public/icons/'+size+'.png',omitBackground:true});await page.close();}}finally{await browser.close();}
