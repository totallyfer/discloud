import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'db.json');

// Estrutura padrão do banco de dados
const defaultData = {
  products: {},
  coupons: {},
  pix: { type: 'Chave', value: '' },
  shopChannel: null
};

// Funções de leitura e escrita seguras
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

// Inicializa o banco ao carregar
db.read();
