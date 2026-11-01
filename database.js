import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'db.json');

const defaultData = {
  products: {}, // { id: { name, price, desc, stock } }
  coupons: {},  // { code: { discountPercent } }
  pix: { type: 'Chave Pix', value: '' },
  shopChannel: null,
  staffRole: null
};

export const db = {
  read() {
    try {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
      }
      const data = fs.readFileSync(file, 'utf-8');
      db.data = JSON.parse(data);
    } catch (e) {
      db.data = defaultData;
    }
  },
  write() {
    try {
      fs.writeFileSync(file, JSON.stringify(db.data, null, 2));
    } catch (e) {
      console.error('Erro ao salvar o banco de dados:', e);
    }
  },
  data: defaultData
};

db.read();
