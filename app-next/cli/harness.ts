import { recordPing, status } from '../lib/domain/spike.ts';

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'ping') console.log(JSON.stringify(recordPing({ note: rest.join(' ') })));
else if (cmd === 'status') console.log(JSON.stringify(status()));
else { console.error('usage: harness ping <note> | status'); process.exit(2); }
