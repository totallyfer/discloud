import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, {
  products: {}, // { id: { name, price, description } }
  coupons: {},  // { code: { discount } }
  pix: { type: 'Chave', value: '' }, // { type: 'Chave'/'QRCode', value: '...' }
  shopChannel: null
});

await db.read();
db.data ||= { products: {}, coupons: {}, pix: { type: 'Chave', value: '' }, shopChannel: null };
await db.write();

export { db };
