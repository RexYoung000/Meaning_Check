import {copyFile} from 'node:fs/promises';
// Root LICENSE is the only editable project license source.
await copyFile('LICENSE','public/LICENSE.txt');
